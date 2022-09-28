const AdvatekV2 = require('./advatek');

let adv = new AdvatekV2();

adv.on('message', (msg) => {
    console.log(msg);
});

adv.on('ready', () => {
    adv.sendPoll();
});