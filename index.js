const fs = require('fs');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";
let showAds;
let m3u8;
let chunkList = [];
let completedChunkList = [];
let folderCreated;
let count;
let elapsed;
let fileFormat = '.ts';
let fileName;
let streamEnd;


const sleep = (ms) => new Promise((f) => setTimeout(f, ms));

async function getAccessToken(id, authToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 5000);
    const data = {
        operationName: "PlaybackAccessToken",
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712"
            }
        },
        variables: {
            isLive: true,
            login: (id),
            isVod: false,
            vodID: "",
            playerType: "embed"
        }
    };
    const options = {
        method: 'POST',
        headers: {
            'Client-id': clientId,
            'Authorization': authToken ? `OAuth ${authToken}` : undefined
        },
        body: JSON.stringify(data),
        signal: controller.signal
    };
    let url = 'https://gql.twitch.tv/gql'

    try {
        let response = await fetch(url, options).catch((error) => { console.log('gat'); throw new Error(error) });
        return (await response.json()).data.streamPlaybackAccessToken;
    } catch (error) {
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function getPlaylist(id, accessToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 5000);
    let options = {
        signal: controller.signal
    };
    let url = `https://usher.ttvnw.net/api/channel/hls/${id}.m3u8?client_id=${clientId}&token=${accessToken.value}&sig=${accessToken.signature}&allow_source=true&allow_audio_only=true`;
    try {
        let response = await fetch(url, options).catch((error) => { throw new Error(error) });
        return await response.text();
    } catch (error) {
        console.log(error);
    } finally {
        clearTimeout(timeout);
    }
}

function parseQualityList(qualityList) {
    let parsedQualityList = [];
    const lines = qualityList.split('\n');
    for (let i = 4; i < lines.length; i += 3) {
        parsedQualityList.push({
            quality: lines[i - 2].split('NAME="')[1].split('"')[0],
            resolution: (lines[i - 1].indexOf('RESOLUTION') != -1 ? lines[i - 1].split('RESOLUTION=')[1].split(',')[0] : null),
            url: lines[i]
        });
    }
    return parsedQualityList;
}

async function getStream(channel, raw, authToken) {
    let accessToken = await getAccessToken(channel, authToken);
    let playlist = await getPlaylist(channel, accessToken);
    return raw ? playlist : parseQualityList(playlist);
}

function extractChunkList(rawList) {
    if (+elapsed !== +elapsed) {
        elapsed = +(rawList.match(/#EXT-X-TWITCH-ELAPSED-SECS:(\d+.\d+)/)[1]);
    }
    rawList = rawList.split('\n');
    for (let i = 0; i < rawList.length; i++) {
        if (rawList[i].includes('#EXT-X-PROGRAM-DATE-TIME:')) {
            let chunk = {
                date: localISO8601(extractDate(rawList[i])),
                url: rawList[i + 2],
                elapsed
            };
            elapsed += +(rawList[i + 1].split("#EXTINF:")[1].split(",")[0]);
            if (chunkList.findIndex(c => c.url == chunk.url) == -1 && completedChunkList.findIndex(c => c.url == chunk.url) == -1) {
                chunkList.push(chunk);
            }
        };
    };
    if (rawList[rawList.length - 1].includes('#EXT-X-ENDLIST')) {
        streamEnd = true;
    };
}

async function getChunkList(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 5000);
    let options = {
        signal: controller.signal
    };
    try {
        let response = await fetch(url, options).catch((error) => { throw new Error(error) });
        return await response.text();
    } catch (error) {
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function getFile(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 5000);
    let options = {
        signal: controller.signal
    };
    try {
        let response = await fetch(url, options).catch((error) => { throw new Error(error) });
        return response;
    } catch (error) {
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function writeFile(response, saveAs) {
    let file = fs.createWriteStream(saveAs);
    await finished(Readable.fromWeb(response).pipe(file));
}

function extractDate(ISO8601) {
    return new Date(ISO8601.split(':').slice(1).join(':'));
}

function localISO8601(date) {
    if (typeof date == 'number') date = new Date(date);
    let tzo = -date.getTimezoneOffset();
    let dif = tzo >= 0 ? '+' : '-';

    return date.getFullYear() +
        '' + String(date.getMonth() + 1).padStart(2, '0') +
        '' + String(date.getDate()).padStart(2, '0') +
        '-' + String(date.getHours()).padStart(2, '0') +
        '' + String(date.getMinutes()).padStart(2, '0') +
        '' + String(date.getSeconds()).padStart(2, '0') +
        '-' + String(date.getMilliseconds()).padStart(3, '0')/*  +
		dif + String(Math.floor(Math.abs(tzo) / 60)).padStart(2, '0') +
		':' + String(Math.abs(tzo) % 60).padStart(2, '0'); */
}

function secondToHour(total) {
    let h = String(Math.floor(total / 3600)).padStart(2, '0');
    let m = String(Math.floor(total % 3600 / 60)).padStart(2, '0');
    let s = String(Math.floor(total % 3600 % 60)).padStart(2, '0');
    let ms = String(Math.round(total * 1000 - Math.floor(total) * 1000)).padStart(3, '0');
    return { h: h, m: m, s: s, ms: ms };
}

function checkPath(path) {
    path = path.replace(/\\/g, '/');
    if (path.slice(-1) != '/') {
        path += '/';
    }
    return path;
}

function downloadLog(count, fileName, downloadTimeElapsed, size) {
    console.log(
        [
            `#${count}`.padEnd(6),
            `[${fileName}]`,
            `elapsed: ${(`${downloadTimeElapsed}ms `).padStart(7)}`,
            `time: ${localISO8601(new Date())}`,
            `size: ${readableBytes(size).padStart(8)}`
        ].join(' ')
    );
}

async function getM3u8Info(streamer, authToken) {
    return await getStream(streamer, false, authToken).then(data => {
        return data[0];
    }).catch(error => {
        console.log(error);
        process.stdout.write(` show ads: ${showAds} ${localISO8601(new Date())}`);
    });
}

let loading = function (s) {
    let p = ["\\", "|", "/", "-"];
    let i = 0;
    if (typeof l != 'undefined' && s == 'stop') {
        process.stdout.write("\r");
        clearInterval(l);
        return l = undefined;
    } else if (typeof l == 'undefined' && s == 'start') {
        return l = setInterval(function () {
            process.stdout.write("\r" + "[" + p[i++] + "]");
            i &= 3;
        }, 300);
    }
};

function readableBytes(size) {
    let i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
    return (size / Math.pow(1024, i)).toFixed(2) /* * 1 */ + '' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
}

function resetVariables() {
    folderPath = process.argv.slice(2)[1];
    m3u8 = undefined;
    folderCreated = false;
    elapsed = undefined;
}

function createDirectory(path) {
    if (!fs.existsSync(path)) {
        try {
            fs.mkdirSync(path, { recursive: true });
            folderCreated = true;
        } catch (error) {
            console.log('createSaveDir()', error);
        }
    };
}

async function twitchStreamDownloader(streamer, folderPath, authToken) {
    process.on('exit', function (code) {
        console.log(`[${Date.now()}] Exit Code: ${code}`);
    });

    process.on('SIGINT', function () {
        process.on('SIGINT', function () {
            console.log('\r[ End ]', 'streamer:', streamer, 'save path:', folderPath, localISO8601(new Date()));
            process.exit();
        });
    });

    console.log('[START]', 'streamer:', streamer, 'save path:', folderPath, localISO8601(new Date()));

    while (typeof m3u8 == 'undefined') {
        loading('start');
        let m3u8Info = await getM3u8Info(streamer, authToken).catch(error => { console.log('getM3u8Info()', error) });;
        if (typeof m3u8Info == 'undefined') {
            await sleep(3000);
        } else {
            m3u8 = m3u8Info.url;
            count = 0;
            streamEnd = false;
            folderCreated = false;
            loading('stop');
            console.log('M3U8:', m3u8);
            console.log('Quality:', m3u8Info.quality);
            console.log('Resolution:', m3u8Info.resolution);
        }
        while (typeof m3u8 != 'undefined') {
            // get playlist(.ts) in m3u8
            let m3u8Content = await getChunkList(m3u8).catch(error => { console.log('getFileContent()', error) });
            extractChunkList(m3u8Content);

            // create folder if not exist
            if (!folderCreated && chunkList.length > 0) {
                folderPath = `${checkPath(savePath)}${chunkList[0]['date']}/`;
                createDirectory(folderPath)
            };
            // download
            let errorCount = 0;
            while (chunkList.length > 0 && folderCreated == true) {
                const downloadStartTime = performance.now();
                const file = await getFile(chunkList[0].url).catch(error => { console.log('getFile()', error) });
                const d = secondToHour(chunkList[0].elapsed);
                fileName = `${chunkList[0].date}(${d.h}${d.m}${d.s}.${d.ms})${fileFormat}`;
                const fileSize = +(file.headers.get('content-length'));
                // const statusCode = file.statusCode;
                await writeFile(file.body, `${folderPath}${fileName}`).then(function () {
                    const downloadTimeElapsed = Math.round(performance.now() - downloadStartTime);
                    errorCount = 0;
                    count++;
                    downloadLog(count, fileName, downloadTimeElapsed, fileSize);
                    chunkList[0].m3u8 = null;
                    completedChunkList.push(chunkList.shift());
                }).catch(error => { console.log('writeFile()', error) });
                await sleep(200);
            };
            await sleep(1000);
            if (streamEnd) {
                resetVariables();
                console.log('[Stream ended]');
                await sleep(9000);
                break;
            };
        };
        resetVariables();
    };
}

let streamer = process.argv.indexOf('-streamer') != -1 ? process.argv[process.argv.indexOf('-streamer') + 1] : undefined;
let savePath = process.argv.indexOf('-savePath') != -1 ? process.argv[process.argv.indexOf('-savePath') + 1] : undefined;
let authToken = process.argv.indexOf('-authToken') != -1 ? process.argv[process.argv.indexOf('-authToken') + 1] : undefined;

if (typeof streamer === 'undefined') {
    console.log('[REQUIRED] -streamer [streamer/channel] -savePath [dir path]');
    console.log('[OPTIONAL] -authToken [authToken]');
    process.exit();
}

twitchStreamDownloader(streamer, savePath, authToken);
