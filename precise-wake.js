/**
 * Copyright 2021 Johannes Kropf
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
     
    const { spawn } = require("child_process");
    const fs = require("fs");

    function preciseWakeNode(config) {
        RED.nodes.createNode(this,config);
        
        this.enginePath = "";
        this.modelPath = config.modelPath;
        this.chunkSize = 4096;
        this.triggerLength = Number(config.window);
        this.triggerThreshold = Number(config.threshold);
        this.passthrough = config.passthrough;
        this.inputProp = config.inputProp;
        this.outputProp = config.outputProp;
        this.controlProp = config.controlProp;
        this.outputArr = [];
        this.forwardNow = false;
        this.pauseListening = false;
        this.statusTimer = false;
        this.inputTimeout = false;
        this.errorStop = false;
        this.preciseConfig = RED.nodes.getNode(config.preciseEngine);
        this.modelName = "";
        
        let node = this;
        
        function node_status(state1 = [], timeout = 0, state2 = []){
            
            if (state1.length !== 0) {
                node.status({fill:state1[1],shape:state1[2],text:state1[0]});
            } else {
                node.status({});
            }
            
            if (node.statusTimer !== false) {
                clearTimeout(node.statusTimer);
                node.statusTimer = false;
            }
            
            if (timeout !== 0) {
                node.statusTimer = setTimeout(() => {
                
                    if (state2.length !== 0) {
                        node.status({fill:state2[1],shape:state2[2],text:state2[0]});
                    } else {
                        node.status({});
                    }
                    
                    node.statusTimer = false;
                    
                },timeout);
            }
        }
        
        function aboveThreshold (value) {
            return (value > node.triggerThreshold) ? true : false;
        }
        
        function rollingThreshold (input) {
            node.outputArr.push(input);
            if (node.outputArr.length > node.triggerLength) {
                node.outputArr.shift();
            }
            const triggered = node.outputArr.every(aboveThreshold);
            if (triggered && node.outputArr.length === node.triggerLength) {
                if (!node.pauseListening && node.passthrough) {
                    node.pauseListening = true;
                    node.forwardNow = true;
                } else if (node.pauseListening) {
                    node.warn("wake-word detetected but ignoring as as audio is already beeing forwarded or listening paused");
                    return;
                }
                let msg = {};
                const avg = node.outputArr.reduce((previous, current) => current += previous) / node.outputArr.length;
                node.outputArr = [];
                const detection = {
                    keyword: node.modelName,
                    timestamp: Date.now(),
                    score: avg,
                    threshold: node.triggerThreshold
                };
                msg[node.outputProp] = detection
                node.send([msg, null]);
                if (node.passthrough) {
                   node_status(["wake word detetected","green","dot"],1000,["forwarding audio","blue","ring"]);
                } else {
                    node_status(["wake word detetected","green","dot"],1000,["listening...","blue","dot"]);
                }
            }
        }
        
        function spawnWake () {
            
            let msg = {};
            
            try{
                node.wakeWord = spawn(node.enginePath,[node.modelPath, node.chunkSize]);
            } 
            catch (error) {
                node_status(["error starting","red","ring"],1500);
                node.error(error);
                return;
            }
            
            node_status(["listening...","blue","dot"]);
            
            node.wakeWord.stderr.on('data', (data)=>{
                const errMsg = data.toString();
                if (errMsg.match(/WARNING\:/g)) { return; }
                node.error("stderr: " + errMsg);
                node_status(["error","red","dot"],1500);
                return;
            });
            
            node.wakeWord.stdin.on('error', (error)=>{
                node.warn("stdin error: " + error);
                return;
            });
            
            node.wakeWord.on('close', function (code,signal) {
                
                node.warn("stopped");
                delete node.wakeWord;
                return;
                
            });
            
            node.wakeWord.stdout.on('data', (data)=>{
                let output = Number(data.toString().trim());
                rollingThreshold(output);
            });
            
        }
        
        function writeChunk (chunk) {
            
            try {
                node.wakeWord.stdin.write(chunk);
            }
            catch (error){
                node.error(error);
            }
            return;
            
        }
        
        function inputTimeoutTimer () {
            if (node.inputTimeout !== false) {
                clearTimeout(node.inputTimeout);
                node.inputTimeout = false;
            }
            node.inputTimeout = setTimeout(() => {
                if (node.wakeWord) {
                    node.wakeWord.kill();
                }
                node.inputTimeout = false;
                node_status(["stopped","grey","dot"],1500);
            }, 2000);
        }
        
        node.enginePath = node.preciseConfig.enginePath;
        if (!fs.existsSync(node.enginePath)) {
            node.errorStop = true;
            node_status(["error","red","dot"]);
            const errortxt = "please check the path you entered to the engine executable in the choosen configuration";
            node.error(errortxt);
            return;
        }
        if (!fs.existsSync(node.modelPath)) {
            node.errorStop = true;
            node_status(["error","red","dot"]);
            const errortxt = "please check the path you entered to the .pb model file";
            node.error(errortxt);
            return;
        }
        node.modelName = node.modelPath.split("/").pop().replace(/\.pb/g, "");
        
        this.on('input', function(msg, send, done) {
            
            if (node.errorStop) {
                if (done) { done(); }
                return;
            }
            
            const input = (node.controlProp in msg) ? RED.util.getMessageProperty(msg, node.controlProp) : RED.util.getMessageProperty(msg, node.inputProp);
            
            switch (input){
            
                case "stop":
                    
                    if(node.wakeWord){
                        node.wakeWord.kill();
                        node_status(["stopped","grey","dot"],1500);
                    } else {
                        node.warn("not started yet");
                    }
                    break;
                    
                case "listen":
                    
                    if(!node.wakeWord){
                        node.warn("not started yet");
                        break;
                    }              
                    if(node.pauseListening === true || node.forwardIt === true){
                        node.pauseListening = false;
                        node.forwardNow = false;
                        node_status(["listening...","blue","dot"]);
                    } else {
                        node.warn("already listening");
                    }
                    break;
                    
                case "pause":
                
                    if(!node.wakeWord){
                        node.warn("not started yet");
                        break;
                    } 
                    if(node.pauseListening === false){
                        node.pauseListening = true;
                        node_status(["paused listening","blue","dot"]);
                    } else {
                        node.warn("already paused");
                    }
                    break;
                    
                case "stop_pause":
                
                    if(!node.wakeWord){
                        node.warn("not started yet");
                        break;
                    } 
                    if(node.pauseListening === true){
                        node.pauseListening = false;
                        node_status(["listening...","blue","dot"]);
                    } else {
                        node.warn("not paused");
                    }
                    break;
                   
                case "forward":
                
                    if(!node.wakeWord){
                        node.warn("not started yet");
                        break;
                    } 
                    if(node.forwardNow === false){
                        node.forwardNow = true;
                        if (node.pauseListening === false) {
                            node_status(["listening to stream and forwarding audio","blue","dot"]);
                        } else {
                            node_status(["paused and forwarding audio","blue","dot"]);
                        }
                    } else {
                        node.warn("already forwarding");
                    }
                    break;
                    
                case "stop_forward":
                
                    if(!node.wakeWord){
                        node.warn("not started yet");
                        break;
                    } 
                    if(node.forwardNow === true){
                        node.forwardNow = false;
                        if (node.pauseListening === true) {
                            node_status(["paused listening","blue","dot"]);
                        } else {
                            node_status(["listening...","blue","dot"]);
                        }
                    } else {
                        node.warn("already paused");
                    }
                    break;
                    
                default:
                    if (Buffer.isBuffer(input)) {
                        if(node.forwardNow) { node.send([null,msg]) }
                        if (!node.wakeWord) {
                            node.chunkSize = input.length;
                            spawnWake();
                        } else {
                            writeChunk(input);
                        }
                        inputTimeoutTimer();
                    }
                    break;
            }
            
            if (done) { done(); }
            return;
        });
        
        this.on('close', function() {
            
            if (node.statusTimer) { clearTimeout(node.statusTimer); }
            node.statusTimer = false;
            node.status({});
            
            if (node.inputTimeout) { clearTimeout(node.inputTimeout); }
            node.inputTimeout = false;
            
            if (node.wakeWord) {
                node.wakeWord.kill();
            }
            
        });
        
    }
    
    RED.nodes.registerType("precise-wake",preciseWakeNode);
    
}