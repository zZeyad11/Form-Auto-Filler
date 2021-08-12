const puppeteer = require('puppeteer');
const request = require('request-promise-native');
const poll = require('promise-poller').default;



let JsonData = JSON.parse(require('fs').readFileSync('Config.json'));

var Page_Url = JsonData["Page_Url"];
var Site_Key = JsonData["Site_Key"];
var API_Key = JsonData["API_Key"];
var CSV_File_Path = JsonData["CSV_File_Path"];
var Fields = JsonData["Fields"];
var DelayTimeInSec = JsonData["DelayTimeInSec"];
var MaxSumbits = JsonData["MaxSubmits"];
var StartingOffset = JsonData["StartingOffset"];
var SubmitButton = JsonData["SubmitButton"];
var ExpectedMessage = JsonData["ExpectedMessage"];


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

async function pollForRequestResults(key, id, retries = 30, interval = 1500, delay = 15000) {
    await timeout(delay);
    return poll({
        taskFn: requestCaptchaResults(key, id),
        interval,
        retries
    });
}

function requestCaptchaResults(apiKey, requestId) {
    const url = `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=1`;
    return async function() {
        return new Promise(async function(resolve, reject) {
            const rawResponse = await request.get(url);
            const resp = JSON.parse(rawResponse);
            if (resp.status === 0) return reject(resp.request);
            resolve(resp.request);
        });
    }
}
const timeout = millis => new Promise(resolve => setTimeout(resolve, millis));


var arr = [];
var CurrentRow = 0; // Zero Equals The first Line using Zero-Indexing System based

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



(async function main() {
    const response = await request.post('http://2captcha.com/in.php', { form: formData });



    const browser = await puppeteer.launch(chromeOptions);
    // const page = await browser.newPage();
    const page = await getActivePage(browser, 1000);
    await page.goto(Page_Url);

    //Reads Each Row In 
    for (var itemNumb in arr) {

        //Type The data into its Fields According to The json File
        var item = arr[itemNumb];
        if (CurrentRow < StartingOffset) {
            CurrentRow++;
            continue;
        }
        if (MaxSumbits - 1 == CurrentRow) {
            break;
        }

        //Fills The Data for The current Row
        for (let AI = 0; AI < item.length; AI++) {

            var ColumInfoClassAndID = Fields["Col" + AI];
            var ColumInfoData = item[AI];
            if (ColumInfoClassAndID != null) {
                var Selector = (ColumInfoClassAndID["ID"] == "" ? "" : ("#" + ColumInfoClassAndID["ID"])) + (ColumInfoClassAndID["ClassName"] == "" ? "" : ("." + ColumInfoClassAndID["ClassName"])) + (ColumInfoClassAndID["Name"] == "" ? "" : ("[name=\"" + ColumInfoClassAndID["Name"] + "\"]"));
                await page.type(Selector, ColumInfoData);
            }
        }

        //Trying To Bypass CAPTCHAs 
        try {
            const requestId = await initiateCaptchaRequest(API_Key);
            const response = await pollForRequestResults(API_Key, requestId);
            await page.evaluate(`document.getElementById("g-recaptcha-response").innerHTML="${response}";`);
        } catch {
            console.log("Failed In Captcha solving of Row Num: " + CurrentRow);
            continue;
        }

        //Click Sumbit Button
        var ButtonSelector = (SubmitButton["ID"] == "" ? "" : ("#" + SubmitButton["ID"])) + (SubmitButton["ClassName"] == "" ? "" : ("." + SubmitButton["ClassName"])) + (SubmitButton["type"] == "" ? "" : ("[type=\"" + SubmitButton["type"] + "\"]"));
        await page.click(ButtonSelector);
        await timeout(1000);

        const data = await page.evaluate(() => document.querySelector('*').outerHTML);

        if (data.includes(ExpectedMessage["ExpectedText"])) {
            console.log("Done Row Num: " + CurrentRow);
        } else {
            console.log("Failed Row Num: " + CurrentRow);
        }


        CurrentRow++;
        await page.goto(Page_Url);
        await timeout(parseInt(DelayTimeInSec) * 1000); //Waits for Time , Set in The json File
    }
})();