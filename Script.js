const puppeteer = require('puppeteer');
const request = require('request-promise-native');
const poll = require('promise-poller').default;
const DomParser = require('dom-parser')
let JsonData = JSON.parse(require('fs').readFileSync('Config.json'));
var Page_Url = JsonData["Page_Url"];
var Site_Key = JsonData["Site_Key"];
var API_Key = JsonData["API_Key"];
var CSV_File_Path = JsonData["CSV_File_Path"];
var Fields = JsonData["Fields"];
var DelayTimeInSec = JsonData["DelayTimeInSec"];
var MaxSubmits = JsonData["MaxSubmits"];
var StartingOffset = JsonData["StartingOffset"];
var SubmitButton = JsonData["SubmitButton"];
var ExpectedMessage = JsonData["ExpectedMessage"];
var IsRandom = JsonData["Is_Random"];
var DelayResponse = parseInt(JsonData["DelayResponse"]);

const chromeOptions = {
    headless: false,
    defaultViewport: null,
    slowMo: 10,
};
const formData = {
    method: 'userrecaptcha',
    key: API_Key,
    googlekey: Site_Key,
    pageurl: Page_Url,
    json: 1
};
const siteDetails = {
    sitekey: Site_Key,
    pageurl: Page_Url
}
async function initiateCaptchaRequest(apiKey) {
    const formData = {
        method: 'userrecaptcha',
        googlekey: siteDetails.sitekey,
        key: apiKey,
        pageurl: siteDetails.pageurl,
        json: 1
    };
    const response = await request.post('http://2captcha.com/in.php', { form: formData });
    return JSON.parse(response).request;
}
async function pollForRequestResults(key, id, retries = 30, interval = 1500, delay = DelayResponse) {
    await timeout(delay);
    return poll({
        taskFn: requestCaptchaResults(key, id),
        interval,
        retries
    });
}

function requestCaptchaResults(apiKey, requestId) {
    const url = `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=`;
    return async function() {
        const rawResponse = await request.get(url);
        const resp = JSON.parse(rawResponse);
        return new Promise(async function(resolve, reject) {
            if (resp.status === 0) return reject(resp.request);
            resolve(resp.request);
        });

    }
}



const timeout = millis => new Promise(resolve => setTimeout(resolve, millis));
var arr = [];
var RandomDone = [];
var CurrentRow = 0;
var stream = require("fs").createReadStream(CSV_File_Path);
var reader = require("readline").createInterface({ input: stream });
reader.on("line", (row) => {
    var a = row.split(",");
    arr.push(a);
});
async function getActivePage(browser, timeout) {
    var start = new Date().getTime();
    while (new Date().getTime() - start < timeout) {
        var pages = await browser.pages();
        var arr = [];
        for (const p of pages) {
            if (await p.evaluate(() => { return document.visibilityState == 'visible' })) {
                arr.push(p);
            }
        }
        if (arr.length == 1) return arr[0];
    }
    throw "Unable to get active page";
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}
var GlobalDebug = (function() {
    var savedConsole = console;
    console = {};
    console.log = function(message) { if (!message.includes('waitFor')) { savedConsole.log(message); } };
    console.warn = function(message) { if (!message.includes('waitFor')) { savedConsole.warn(message); } };
    console.error = function(message) { if (!message.includes('waitFor')) { savedConsole.error(message); } };
});
const waitTillHTMLRendered = async(page, timeout = 30000) => {
    const checkDurationMsecs = 1000;
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 3;
    while (checkCounts++ <= maxChecks) {
        let html = await page.content();
        let currentHTMLSize = html.length;
        let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length);
        if (lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize)
            countStableSizeIterations++;
        else
            countStableSizeIterations = 0; //reset the counter
        if (countStableSizeIterations >= minStableSizeIterations) {
            break;
        }
        lastHTMLSize = currentHTMLSize;
        await page.waitFor(checkDurationMsecs);
    }
};
try {
    (async function main() {
        const response = await request.post('http://2captcha.com/in.php', { form: formData });
        GlobalDebug();
        const browser = await puppeteer.launch(chromeOptions);
        const page = await getActivePage(browser, 1000);
        if (!IsRandom) {
            for (let Q = StartingOffset; Q < arr.length; Q++) {
                try {
                    CurrentRow = Q;
                    if (CurrentRow < StartingOffset) {
                        continue;
                    }
                    if (MaxSubmits - 1 == CurrentRow) {
                        break;
                    }
                    await page.goto(Page_Url);
                    await waitTillHTMLRendered(page);
                    var item = arr[Q];
                    for (let AI = 0; AI < item.length; AI++) {
                        var ColumInfoClassAndID = Fields["Col" + AI];
                        var ColumInfoData = item[AI];
                        if (ColumInfoClassAndID != null) {

                            var Selector = (ColumInfoClassAndID["TagName"] == "" ? "" : (ColumInfoClassAndID["TagName"])) + (ColumInfoClassAndID["ID"] == "" ? "" : ("#" + ColumInfoClassAndID["ID"])) + (ColumInfoClassAndID["ClassName"] == "" ? "" : ("." + ColumInfoClassAndID["ClassName"])) + (ColumInfoClassAndID["Name"] == "" ? "" : ("[name=\"" + ColumInfoClassAndID["Name"] + "\"]") + (ColumInfoClassAndID["Type"] == "" ? "" : ("[type=\"" + ColumInfoClassAndID["Type"] + "\"]")));
                            await page.type(Selector, ColumInfoData);
                        }
                    }
                    try {
                        const requestId = await initiateCaptchaRequest(API_Key);
                        const response = await pollForRequestResults(API_Key, requestId);
                        await page.evaluate(`document.getElementById("g-recaptcha-response").innerHTML="${response}";`);
                    } catch {
                        console.log("Failed In Captcha solving of Row Num: " + CurrentRow);
                        Q--;
                        continue;
                    }
                    var ButtonSelector = (SubmitButton["ID"] == "" ? "" : ("#" + SubmitButton["ID"])) + (SubmitButton["ClassName"] == "" ? "" : ("." + SubmitButton["ClassName"])) + (SubmitButton["type"] == "" ? "" : ("[type=\"" + SubmitButton["type"] + "\"]"));
                    await page.click(ButtonSelector);
                    await timeout(1000);
                    await waitTillHTMLRendered(page);
                    if (ExpectedMessage["ExpectedText"] != '') {
                        var parser = new DomParser();
                        var dom = parser.parseFromString((await page.evaluate(() => document.querySelector('*').outerHTML)));
                        var texts = (dom.getElementsByTagName(ExpectedMessage["TagName"])).filter(Obj => (ExpectedMessage["ID"] != '' ? (Obj.getAttribute("id") == ExpectedMessage["ID"]) : true) && (ExpectedMessage["ClassName"] != '' ? (Obj.getAttribute("class") == ExpectedMessage["ClassName"]) : true) && (ExpectedMessage["Name"] != '' ? (Obj.getAttribute("name") == ExpectedMessage["Name"]) : true)).map(e => e.textContent);
                        if (texts.includes(ExpectedMessage["ExpectedText"])) {
                            console.log("Done Row Num: " + CurrentRow);
                        } else {
                            console.log("Failed Row Num: " + CurrentRow);
                            continue;
                        }
                    }
                    await timeout(parseInt(DelayTimeInSec) * 1000);
                } catch (exception) {
                    console.log("Failed In Captcha solving of Row Num: " + CurrentRow);
                    console.log(exception.stack);
                    console.log(exception.message);
                    Q--;
                    continue;
                }
            }
        } else {
            while (RandomDone.length <= parseInt(MaxSubmits)) {
                try {
                    var Q = getRandomInt(StartingOffset, arr.length);
                    while (RandomDone.includes(Q)) {
                        Q = getRandomInt(StartingOffset, arr.length);
                    }
                    CurrentRow = Q;
                    if (CurrentRow < StartingOffset) {
                        continue;
                    }
                    await page.goto(Page_Url);
                    await waitTillHTMLRendered(page);
                    var item = arr[Q];
                    for (let AI = 0; AI < item.length; AI++) {

                        var ColumInfoClassAndID = Fields["Col" + AI];
                        var ColumInfoData = item[AI];
                        if (ColumInfoClassAndID != null) {
                            var Selector = (ColumInfoClassAndID["TagName"] == "" ? "" : (ColumInfoClassAndID["TagName"])) + (ColumInfoClassAndID["ID"] == "" ? "" : ("#" + ColumInfoClassAndID["ID"])) + (ColumInfoClassAndID["ClassName"] == "" ? "" : ("." + ColumInfoClassAndID["ClassName"])) + (ColumInfoClassAndID["Name"] == "" ? "" : ("[name=\"" + ColumInfoClassAndID["Name"] + "\"]") + (ColumInfoClassAndID["Type"] == "" ? "" : ("[type=\"" + ColumInfoClassAndID["Type"] + "\"]")));
                            await page.type(Selector, ColumInfoData);
                        }
                    }
                    try {
                        const requestId = await initiateCaptchaRequest(API_Key);
                        const response = await pollForRequestResults(API_Key, requestId);
                        await page.evaluate(`document.getElementById("g-recaptcha-response").innerHTML="${response}";`);
                    } catch {
                        console.log("Failed In Captcha solving of Row Num: " + CurrentRow);
                        continue;
                    }
                    var ButtonSelector = (SubmitButton["ID"] == "" ? "" : ("#" + SubmitButton["ID"])) + (SubmitButton["ClassName"] == "" ? "" : ("." + SubmitButton["ClassName"])) + (SubmitButton["type"] == "" ? "" : ("[type=\"" + SubmitButton["type"] + "\"]"));
                    await page.click(ButtonSelector);
                    await timeout(1000);
                    await waitTillHTMLRendered(page);
                    if (ExpectedMessage["ExpectedText"] != '') {
                        var parser = new DomParser();
                        var dom = parser.parseFromString((await page.evaluate(() => document.querySelector('*').outerHTML)));
                        var texts = (dom.getElementsByTagName(ExpectedMessage["TagName"])).filter(Obj => (ExpectedMessage["ID"] != '' ? (Obj.getAttribute("id") == ExpectedMessage["ID"]) : true) && (ExpectedMessage["ClassName"] != '' ? (Obj.getAttribute("class") == ExpectedMessage["ClassName"]) : true) && (ExpectedMessage["Name"] != '' ? (Obj.getAttribute("name") == ExpectedMessage["Name"]) : true)).map(e => e.textContent);
                        if (texts.includes(ExpectedMessage["ExpectedText"])) {
                            console.log("Done Row Num: " + CurrentRow);
                        } else {
                            console.log("Failed Row Num: " + CurrentRow);
                            continue;
                        }
                    }
                    RandomDone.push(Q);
                    await timeout(parseInt(DelayTimeInSec) * 1000); //Waits for Time , Set in The json File
                } catch (exception) {
                    console.log("Failed In Captcha solving of Row Num: " + CurrentRow);
                    console.log(exception.stack);
                    console.log(exception.message);
                    Q--;
                    continue;
                }
            }
        }
    })();
} catch (exception1) {
    console.log(exception1.stack);
    console.log(exception1.message);

}