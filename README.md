# TwitchStreamDownloader
How to use it
```
node index.js -streamer [streamer/channel] -savePath [dir path]
[REQUIRED] -streamer [streamer/channel] -savePath [dir path]
[OPTIONAL] -authToken [authToken]
```
Consoole output
```
[START] streamer: [streamer/channel] save path: [dir path]
M3U8: [m3u8 url]
Quality: [quality e.g. 1080p60 (source)]
Resolution: [resolution e.g. 1920x1080]
#1     [20230309-183535-400(030520.000).ts] elapsed:  325ms  time: 20230309-183607-444 size:   1.43MB
#2     [20230309-183537-400(030522.000).ts] elapsed:  171ms  time: 20230309-183607-800 size:   1.52MB
#3     [20230309-183539-400(030524.000).ts] elapsed:  168ms  time: 20230309-183608-777 size:   1.55MB
```
