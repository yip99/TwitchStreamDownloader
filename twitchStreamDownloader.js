// github.com/dudik/twitch-m3u8
// 1.1.5

const https = require('https');

const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";

let showAds;

function getAccessToken(id, authToken) {
    const data = JSON.stringify({
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
    });
    const options = {
        hostname: 'gql.twitch.tv',
        port: 443,
        path: '/gql',
        method: 'POST',
        headers: {
            'Client-id': clientId
        }
    };

    if (authToken) {
        options.headers.Authorization = `OAuth ${authToken}`;
    }

    return new Promise((resolve, reject) => {
        const req = https.request(options, (response) => {
            var resData = {};
            resData.statusCode = response.statusCode;
            resData.body = [];
            response.on('data', (chunk) => resData.body.push(chunk));
            response.on('end', () => {
                resData.body = resData.body.join('');

                if (resData.statusCode != 200) {
                    reject(new Error(resData.statusCode));
                } else {
                    try {
                        showAds = JSON.parse(JSON.parse(resData?.body)?.data?.streamPlaybackAccessToken?.value)?.show_ads;
                    } catch (e) {
                        // console.log(e);
                    }
                    resolve(JSON.parse(resData.body).data.streamPlaybackAccessToken);
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.write(data);
        req.end();
    });
}

function getPlaylist(id, accessToken) {
    return new Promise((resolve, reject) => {
        const req = https.get(`https://usher.ttvnw.net/api/channel/hls/${id}.m3u8?client_id=${clientId}&token=${accessToken.value}&sig=${accessToken.signature}&allow_source=true&allow_audio_only=true`, (response) => {
            let data = {};
            data.statusCode = response.statusCode;
            data.body = [];
            response.on('data', (chunk) => data.body.push(chunk));
            response.on('end', () => {
                data.body = data.body.join('');

                switch (data.statusCode) {
                    case 200:
                        resolve(resolve(data.body));
                        break;
                    case 404:
                        reject(new Error('Transcode does not exist - the stream is probably offline'));
                        break;
                    default:
                        reject(new Error(`Twitch returned status code ${data.statusCode}`));
                        break;
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.end()
    });
}

function parsePlaylist(playlist) {
    const parsedPlaylist = [];
    const lines = playlist.split('\n');
    for (let i = 4; i < lines.length; i += 3) {
        parsedPlaylist.push({
            quality: lines[i - 2].split('NAME="')[1].split('"')[0],
            resolution: (lines[i - 1].indexOf('RESOLUTION') != -1 ? lines[i - 1].split('RESOLUTION=')[1].split(',')[0] : null),
            url: lines[i]
        });
    }
    return parsedPlaylist;
}

function getStream(channel, raw, authToken) {
    return new Promise((resolve, reject) => {
        getAccessToken(channel, authToken)
            .then((accessToken) => getPlaylist(channel, accessToken, false))
            .then((playlist) => resolve((raw ? playlist : parsePlaylist(playlist))))
            .catch(error => reject(error));
    });
}

const fs = require('fs');
const sleep = (ms) => new Promise((f) => setTimeout(f, ms));

function getFileContent(url) {
    return new Promise((resolve, reject) => {
        let req = https.get(url, { agent: false }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                resolve(body);
            });
        });
        req.on('error', (error) => reject(error));
        req.end();
    })
}

async function getFile(url) {
    return new Promise((resolve, reject) => {
        let req = https.get(url, { agent: false }, (response) => {
            resolve(response);
        });
        req.on('error', (error) => reject(error));
        req.end();
    })
}

async function writeFile(response, saveAs) {
    return new Promise((resolve, reject) => {
        let file = fs.createWriteStream(saveAs);
        response.pipe(file);
        file.on('error', error => { reject(error) });
        file.on('finish', () => { resolve() });
    });
}

function extractDate(ISO8601) {
    if (typeof ISO8601 != 'string') {
        throw 'not string'
    }
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

function downloadLog(count, fileName, downloadTimeElapsed, size, statusCode) {
    console.log(
        [
            `#${count}`.padEnd(6),
            `[${fileName}]`,
            `elapsed: ${(`${downloadTimeElapsed}ms `).padStart(7)}`,
            `time: ${localISO8601(new Date())}`,
            `size: ${readableBytes(size).padStart(8)}`,
            statusCode
        ].join(' ')
    );
}

async function getM3u8Info(streamer, authToken) {
    return await getStream(streamer, false, authToken).then(data => {
        return data[0];
    }).catch(error => {
        process.stdout.write(` show ads: ${showAds} ${error.message} ${localISO8601(new Date())}`);
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
    let m3u8;
    let chunkList = [];
    let completedChunkList = [];
    let folderCreated;
    let count;
    let duration;
    let fileFormat = '.ts';
    let fileName;
    let streamEnd;

    console.log('[START]', 'streamer:', streamer, 'save path:', folderPath, localISO8601(new Date()));

    while (typeof m3u8 == 'undefined') {
        loading('start');
        let m3u8Info = await getM3u8Info(streamer, authToken).catch(error => { console.log('getM3u8Info()', error.message) });;
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
            await getFileContent(m3u8).then(m3u8Content => {
                m3u8Content = m3u8Content.split('\n');
                for (let i = 0; i < m3u8Content.length; i++) {
                    if (+duration !== +duration) {
                        if (m3u8Content[i].startsWith('#EXT-X-TWITCH-ELAPSED-SECS:')) {
                            duration = Number(m3u8Content[i].split('#EXT-X-TWITCH-ELAPSED-SECS:')[1]);
                        }
                    }
                    if (m3u8Content[i].startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
                        let chunk = {
                            date: localISO8601(extractDate(m3u8Content[i])),
                            length: m3u8Content[i + 1].split("#EXTINF:")[1].split(",")[0],
                            url: m3u8Content[i + 2],
                            m3u8: m3u8Content,
                        };
                        if (chunkList.findIndex(c => c.url == chunk.url) == -1 && completedChunkList.findIndex(c => c.url == chunk.url) == -1) {
                            chunkList.push(chunk);
                        }
                    };
                };
                if (m3u8Content[m3u8Content.length - 1].includes('#EXT-X-ENDLIST')) {
                    streamEnd = true;
                };
            }).catch(error => { console.log('getFileContent()', error.message) });

            // create folder if not exist
            if (!folderCreated && chunkList.length > 0) {
                folderPath = `${checkPath(savePath)}${chunkList[0]['date']}/`;
                if (!fs.existsSync(folderPath)) {
                    try {
                        fs.mkdirSync(folderPath, { recursive: true });
                    } catch (error) {
                        console.log('createSaveDir()', error.message);
                        return;
                    }
                };

                if (fs.existsSync(folderPath)) {
                    folderCreated = true;
                };
            };
            // download
            let errorCount = 0;
            while (chunkList.length > 0 && folderCreated == true) {
                const downloadStartTime = performance.now();
                let d = secondToHour(duration);
                fileName = `${chunkList[0].date}(${d.h}${d.m}${d.s}.${d.ms})${fileFormat}`;
                await getFile(chunkList[0].url).then(async function (response) {
                    // if ((response.statusCode != 200) || (performance.now() - downloadStartTime > 500) || (count < 3)) {
                    // console.log(chunkList[0].m3u8);
                    // }
                    if (response.statusCode == 404 && errorCount < 3) {
                        errorCount++;
                        console.log('404');
                        await sleep(1000);
                        return;
                    }
                    await writeFile(response, `${folderPath}${fileName}`).then(function () {
                        downloadTimeElapsed = Math.round(performance.now() - downloadStartTime);
                        errorCount = 0;
                        count++;
                        duration += Number(chunkList[0].length);
                        downloadLog(count, fileName, downloadTimeElapsed, response.headers['content-length'], response.statusCode);
                        chunkList[0].m3u8 = null;
                        completedChunkList.push(chunkList.shift());
                    }).catch(error => { console.log('writeFile()', error.message) });
                }).catch(error => { console.log('getFile()', error.message) });
                await sleep(200);
            };
            await sleep(1000);
            if (streamEnd) {
                folderPath = process.argv.slice(2)[1];
                m3u8 = undefined;
                folderCreated = false;
                duration = undefined;
                console.log('[Stream ended]');
                await sleep(9000);
                break;
            };
        };
    };
}

let streamer = process.argv.indexOf('-streamer') != -1 ? process.argv[process.argv.indexOf('-streamer') + 1] : undefined;
let savePath = process.argv.indexOf('-savePath') != -1 ? process.argv[process.argv.indexOf('-savePath') + 1] : undefined;
let authToken = process.argv.indexOf('-authToken') != -1 ? process.argv[process.argv.indexOf('-authToken') + 1] : undefined;

if (typeof streamer === 'undefined') {
    console.log('[REQUIRED] -streamer ${streamer} -savePath ${savePath}');
    console.log('[OPTIONAL] -authToken ${authToken}');
    process.exit();
}

twitchStreamDownloader(streamer, savePath, authToken);
