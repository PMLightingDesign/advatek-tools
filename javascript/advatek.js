const { timeStamp } = require('console');
const { EventEmitter } = require('events');

const PORT = 49150;

const POLL_ADRRESS = '255.255.255.255';

class AdvatekV2 extends EventEmitter {

    constructor() {
        super();

        this.udp = require('dgram').createSocket('udp4');

        this.ready = false;

        this.udp.bind(PORT, () => {
            this.udp.setBroadcast(true);
            this.ready = true;

            this.emit('ready');
        });

        this.udp.on('message', (msg, rinfo) => {
            let reply = AdvatekV2.parseReply(msg);
            this.emit('message', reply);
        });
    }

    sendPoll(){
        if (!this.ready) {
            this.emit('error', 'Socket not ready');
        }

        let packet = AdvatekV2.packetPrefix(AdvatekV2.opCode("OpPoll"));

        this.udp.send(packet, 0, packet.length, PORT, POLL_ADRRESS, (err) => {
            if (err) console.log(err);
        });
    }

    static parseReply(msg){
        let reply = {};

        reply.id = msg.slice(0, 8).toString();
        reply.opcodeInt = msg[9] << 8 | msg[10];
        reply.opcode = AdvatekV2.opCodeToString(reply.opcodeInt);
        reply.version = msg[11];

        // Check if the id is "Advatech"
        if (reply.id != "Advatech") {
            return {};
        }

        // If it's a pool reply, parse the rest of the packet
        if(reply.opcode == "OpPollReply"){
            return AdvatekV2.parsePollReply(msg, reply);
        }

        return reply;

    }

    static parsePollReply(msg, packet){
        // We need to keep track of the current index because of variable length fields
        let i = 12;

        // Hardware information
        packet.versionCurrent = msg[i]; i++;
        packet.mac = AdvatekV2.macToString(msg.slice(i, i + 6)); i += 6;
        let lenModel = msg[i]; i++;
        let model = msg.slice(i, i + lenModel);
        // Trim the null bytes from the end of the string
        packet.model = model.toString().replace(/\0/g, ''); i += lenModel;
        packet.hwRev = msg[i] / 10; i++;
        // SW Version is semver, so we need to convert it to a string
        packet.assistantSwRev = msg[i] + "." + msg[i + 1] + "." + msg[i + 2]; i += 3;
        // Dump the rest of the packet that's not parsed to a Uint8Array
        packet.lenFirmware = msg[i]; i++;
        packet.firmware = msg.slice(i, i + packet.lenFirmware).toString().replace(/\0/g, ''); i += packet.lenFirmware;
        packet.brand = msg[i]; i++;

        // Network information
        packet.ip = msg.slice(i, i + 4).join("."); i += 4;
        packet.subnet = msg.slice(i, i + 4).join("."); i += 4;
        packet.dhcp = msg[i] == 1; i++;
        packet.ipStatic = msg.slice(i, i + 4).join("."); i += 4;
        packet.subnetStatic = msg.slice(i, i + 4).join("."); i += 4;
        packet.protocol = msg[i] == 0 ? "sACN" : "Art-Net"; i++;
        packet.holdLast = msg[i] == 1; i++;

        // Config Information
        // Simple Config
        packet.simpleConf = msg[i] == 1; i++;
        packet.maxPixPerOutput = msg[i] << 8 | msg[i + 1]; i += 2;
        packet.numOutputs = msg[i]; i++;
        packet.outputPixels = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputPixels[j] = msg[i] << 8 | msg[i + 1]; i += 2;
        }

        packet.outputUniverse = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputUniverse[j] = msg[i] << 8 | msg[i + 1]; i += 2;
        }

        packet.outputChannel = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputChannel[j] = msg[i] << 8 | msg[i + 1]; i += 2;
        }

        packet.outputNull = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputNull[j] = msg[i]; i++;
        }

        packet.outputZig = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputZig[j] = msg[i] << 8 | msg[i + 1]; i += 2;
        }

        packet.outputReverse = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputReverse[j] = msg[i] == 0 ? "Normal" : "Reversed"; i++;
        }

        packet.colorOrder = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.colorOrder[j] = AdvatekV2.colorOrderToString(msg[i]); i++;
        }

        packet.outputGrouping = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputGrouping[j] = msg[i] << 8 | msg[i + 1]; i += 2;
        }

        packet.outputBrightness = new Array(packet.numOutputs);
        for (let j = 0; j < packet.numOutputs; j++) {
            packet.outputBrightness[j] = msg[i]; i++;
        }

        // DMX Config
        packet.numDMXOut = msg[i]; i++;
        let protocolsAllowed = msg[i]; i++;
        // Bit zero is sACN, bit one is Art-Net
        packet.dmxACNAllowed = (protocolsAllowed & 0x01) == 0x01;
        packet.dmxArtNetAllowed = (protocolsAllowed & 0x02) == 0x02;

        packet.dmxEnabled = new Array(packet.numDMXOut);
        for (let j = 0; j < packet.numDMXOut; j++) {
            packet.dmxEnabled[j] = msg[i] == 1; i++;
        }

        packet.dmxUniverse = new Array(packet.numDMXOut);
        for (let j = 0; j < packet.numDMXOut; j++) {
            packet.dmxUniverse[j] = msg[i] << 8 | msg[i + 1]; i += 2;
        }

        packet.numDrivers = msg[i]; i++;

        let lenDriverType = msg[i]; i++;
        packet.driverType = new Array(packet.numDrivers);
        for (let j = 0; j < packet.numDrivers; j++) {
            packet.driverType[j] = AdvatekV2.getDriverType(msg[i]); i++;
        }

        packet.driverSpeed = new Array(packet.numDrivers);
        for (let j = 0; j < packet.numDrivers; j++) {
            packet.driverSpeed[j] = AdvatekV2.getDriverSpeed(msg[i]); i++;
        }

        packet.driverExpandable = new Array(packet.numDrivers);
        for (let j = 0; j < packet.numDrivers; j++) {
            packet.driverExpandable[j] = msg[i] == 1; i++;
        }

        packet.driverName = new Array(packet.numDrivers);
        for (let j = 0; j < packet.numDrivers; j++) {
            packet.driverName[j] = msg.slice(i, i + lenDriverType).toString().replace(/\0/g, ''); i += lenDriverType;
        }

        packet.currentDriverInt = msg[i];
        packet.currentDriver = packet.driverName[msg[i]]; i++;
        packet.currentDriverType = msg[i] == 0 ? "RGB" : "RGBW"; i++;
        packet.currentDriverSpeed = AdvatekV2.getDriverSpeed(msg[i]); i++;
        packet.currentDriverExpanded = msg[i] == 1; i++;

        // Gamma
        packet.gamma = new Array(4);
        for (let j = 0; j < 4; j++) {
            packet.gamma[j] = msg[i] / 10; i++;
        }

        // The device nickname is a fixed 40 characters
        packet.nickname = msg.slice(i, i + 40).toString().replace(/\0/g, ''); i += 40;

        // 16 bit, temp * 10 in degrrees C
        packet.temperture = (msg[i] << 8 | msg[i + 1]) / 10; i += 2;
        packet.maxTargetTemp = msg[i]; i++;

        // Power input banks
        packet.numPowerBanks = msg[i]; i++;
        packet.powerBankVoltage = new Array(packet.numPowerBanks);
        for (let j = 0; j < packet.numPowerBanks; j++) {
            packet.powerBankVoltage[j] = (msg[i] << 8 | msg[i + 1])/10; i += 2;
        }

        // Test mode
        packet.testMode = AdvatekV2.getTestMode(msg[i]); i++;
        packet.testColor = new Array(4);
        for (let j = 0; j < 4; j++) {
            packet.testColor[j] = msg[i]; i++;
        }
        packet.testOutputNum = msg[i]; i++;
        packet.testPixelNum = msg[i] << 8 | msg[i + 1]; i += 2;       

        return packet;
    }

    static getTestMode(testMode) {
        switch (testMode) {
            case 0:
                return "None (Live Data)";
            case 1:
                return "RGBW Cycle";
            case 2:
                return "Red";
            case 3:
                return "Green";
            case 4:
                return "Blue";
            case 5:
                return "White";
            case 6:
                return "Set Color";
            case 7:
                return "Color Fade";
            case 8:
                return "Single Pixel";
            default:
                return "Unknown";
        }
    }

    static getDriverSpeed(speed){
        switch(speed){
            case 0:
                return "N/A (Fixed single speed)";
            case 1:
                return "Slow only";
            case 2:
                return "Fast only";
            case 3:
                return "Either slow or fast";
            case 4:
                return "Adjustable clock speed";
            default:
                return "Unknown";
        }
    }

    static getDriverType(t){
        switch(t){
            case 0:
                return "RGB Only";
            case 1:
                return "RGBW Only";
            case 2:
                return "Either";
            default:
                return "Unknown";
        }
    }

    static colorOrderToString(colorOrder){
        switch (colorOrder) {
            case 0:
                return "RGB / RGBW";    
            case 1:
                return "RBG / RBGW";
            case 2:
                return "GRB / GRBW";
            case 3:
                return "GBR / GBWR";
            case 4:
                return "BRG / BRGW";
            case 5:
                return "BGR / BGWR";
            case 6:
                return "RGWB";
            case 7:
                return "RWGB";
            case 8:
                return "GRWB";
            case 9:
                return "GWRB";
            case 10:
                return "WRGB";
            case 11:
                return "WGRB";
            case 12:
                return "RBWG";
            case 13:
                return "RWBG";
            case 14:
                return "BRWG";
            case 15:
                return "BWRG";
            case 16:
                return "WRBG";
            case 17:
                return "WBRG";
            case 18:
                return "GBWR";
            case 19:
                return "GWBR";
            case 20:
                return "BGWR";
            case 21:
                return "BWGR";
            case 22:
                return "WGBR";
            case 23:
                return "WBGR";
            default:
                return "Unknown";
        }
    }

    static macToString(mac){
        let macString = "";
        for (let i = 0; i < mac.length; i++) {
            // Pad the string with a 0 if the value is less than 16
            macString += (mac[i] < 16 ? "0" : "") + mac[i].toString(16);
            if (i < mac.length - 1) {
                macString += ":";
            }
        }
        return macString;
    }

    // Returns a Uint8Array with the start of an Advatek packet
    static packetPrefix(opcode){
        let prefix = new Uint8Array(12);
        // The first 8 characters of the packet are "Advatech"
        let id = [65, 100, 118, 97, 116, 101, 99, 104];
        // Copy the array into the first 8 bytes of the packet
        prefix.set(id, 0);
        // Set the opcode. This spans the 10th and 11th bytes as a 16-bit integer
        prefix[9] = (opcode >> 8) & 0xff;
        prefix[10] = opcode & 0xff;
        // The protocol version is 8
        prefix[11] = 8;
        return prefix;
    }

    static opCode(name){
        switch(name){
            case "OpPoll":
                return 0x01;
            case "OpPollReply":
                return 0x02;
            case "OpConfig":
                return 0x05;
            case "OpBootload":
                return 0x06;
            case "OpNetwork":
                return 0x07;
            case "OpTestSet":
                return 0x08;
            case "OpTestAnnounce":
                return 0x09;
            case "OpVisualIdent":
                return 0x0a;
            default:
                return 0x00;
        }
    }

    static opCodeToString(opcode){
        switch(opcode){
            case 0x01:
                return "OpPoll";
            case 0x02:
                return "OpPollReply";
            case 0x05:
                return "OpConfig";
            case 0x06:
                return "OpBootload";
            case 0x07:
                return "OpNetwork";
            case 0x08:
                return "OpTestSet";
            case 0x09:
                return "OpTestAnnounce";
            case 0x0a:
                return "OpVisualIdent";
            default:
                return "Unknown";
        }
    }

}

module.exports = AdvatekV2;