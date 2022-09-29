const { lstat } = require('fs');
const AdvatekV2 = require('./advatek');

let pollAdr = '255.255.255.255';

if(process.argv.length > 2) {
    pollAdr = process.argv[2];
}

let adv = new AdvatekV2();

adv.on('message', (msg) => {
    console.log(msg);
});

adv.on('ready', () => {
    adv.sendPoll();
});