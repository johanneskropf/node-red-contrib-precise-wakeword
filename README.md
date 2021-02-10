# node-red-contrib-precise-wakeword
A node-red integration of the [mycroft precise wake word engine](https://github.com/MycroftAI/mycroft-precise) for Linux.
## Installation
To install this node either search for it in the Node-RED pallete manager or install it from the Node-RED folder (in most cases `~/.node-red`)
using either:
```
npm install node-red-contrib-precise-wakeword
```
to install the module from npm or use:
```
npm install johanneskropf/node-red-contrib-precise-wakeword
```
to install it directly from the repository (requires **git** to be installed).
### Prerequisites
This node needs the **precise-engine** binary installed for it to work. There is two ways to install this:
+ option 1: do a binary install of the precise-engine following the [first part of the instructions here](https://github.com/MycroftAI/mycroft-precise/blob/dev/README.md#binary-install).
You dont need to pip install the python wrapper as the node directly wraps the binary in its place.
+ option 2: do a source install of the whole mycroft-precise package following [the instructions here](https://github.com/MycroftAI/mycroft-precise/blob/dev/README.md#source-install).

Which option you choose largely depends on which wake-word model you want to run. The engine can only run models that were trained on the same or older version
as the engine itself. If you want to train your own models you will most likely have to opt for the source install as this way you can choose the same branch that was used for training.
## Basic Usage
To use the node in a first step you will have to create a new configuration. This configuration represents the precise-engine and you will have to enter the 
absolut path to the engine binary in it. If you choose the binary install this will be `.../precise-engine/precise-engine` relative to the path that you unpacked
the binary in. If you choose the source install it will be `.../mycroft-precise/.venv/bin/precise-engine` relative to your choosen cloning destination.
After adding the configuration you now have to enter the path to a model file in the nodes config ui (this file will have the ending *.pb*).
To start you can download the official *hey-mycroft-2* wake-word model *.pb* and *.pb.params* file from [here](https://github.com/MycroftAI/precise-data/tree/models).
For each model you want to use the precise-engine will always need both the *.pb* and the *.pb.params* file in the same path/folder.
Once you have both the engine and model files set up you need to feed raw audio buffer chunks to the precise-wake nodes input.
To do this use for example one of the multiple microphone nodes available for Node-RED:
+ [node-red-contrib-mic](https://flows.nodered.org/node/node-red-contrib-mic)
+ [node-red-contrib-sox-utils](https://github.com/johanneskropf/node-red-contrib-sox-utils) (*beta, needs to be installed directly from repository*)

This stream of audio needs to be in the following format:
+ 16bit
+ little endian
+ signed-integer
+ 16000hz
+ mono

Once the input has started the precise-engine will take anywhere from 10-30 seconds to start up and than listen for the wake-word.
When it detects the wake-word it will send a message to its first output that has several usefull properties:
```
{
  "keyword":"hey-mycroft-2",
  "timestamp":1612953501615,
  "score":0.6189599310573979,
  "threshold":0.5
}
```
+ keyword: the keyword that was configured
+ timestamp: the time at which the keyword was detected
+ score: the score that the detection had
+ threshold: the configured threshold above which the score has to be to count as an activation

To stop the node stop the stream of raw audio buffers and the node will automatically stop.

## Settings
+ Engine: choose a configuration which represents the path to the precise-engine binary
+ Model Path: enter the path to the model file (*.pb*) you want to use
+ Threshold: adjust the threshold above which a detection occurs. The lower the threshold the higher the sensitivity but also the higher the likelihood of false
positives. Adjust to find a balance.
+ Window Size: the number of audio frames that have to be above the threshold to count as a positive activation. This parameter works in conjunction with the threshold. If you encounter to many false positives even when adjusting the threshold you might want to increase the window size or vice versa.
+ Passthrough: if selected the node will pause further detection after a positive match and start to automatically forward the audio buffers from its input. 
+ Input Property: the `msg` property the node listen on for the audio stream.
+ Output Property: the `msg` property the node sends the message on a positive match on
+ Control property: the `msg` property the node listens on for control messages
+ Name: the label to be shown in the editor

## Control Messages
The node supports several control messages to control its behaviour at runtime. These messages need to be sent as a *string* in the configured control
property of a input `msg` object:
+ **pause**: this will pause detection
+ **stop_pause**: this will unpause a paused detection
+ **forward**: this will trigger the node to start forwarding the received audio buffers to its second output
+ **stop_forward**: this will stop the node from forwarding any audio buffers to its second output
+ **listen**: this acts as a combination of **stop_pause** and **stop_forward**
+ **stop**: this will force stop the precise-engine (can be used to restart the node if audio input is not stopped)

## Training Your Own Model
You can train your own model with a precise source install.
be warned this process is quite involved. Here are some links that might help you:
+ https://github.com/MycroftAI/mycroft-precise/wiki/Training-your-own-wake-word#how-to-train-your-own-wake-word
+ https://discourse.nodered.org/t/node-red-contrib-voice2json/37925/14?u=jgkk
+ https://community.rhasspy.org/t/mycroft-precise-installation-and-use/628
+ https://github.com/MycroftAI/mycroft-precise/issues/113

## Alternatives
If you are looking for an alternative to quickly use personal wake-words without the training process have a look at [node-red-contrib-personal-wake-word](https://github.com/johanneskropf/node-red-contrib-personal-wake-word).
This will give you an easy start but will of course not work as a universal wake-word for differnt speakers and will be less noise resistant as it uses a much more simplistic approach.

## Constraints
Precise right now only runs on Linux distributions and on hardware thats at least as fast as the Raspberry Pi 3a+.
