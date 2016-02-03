// This is main process of Electron, started as first thing when your
// app starts. This script is running through entire life of your application.
// It doesn't have any windows which you can see on screen, but we can open
// window from here.


import { app, BrowserWindow } from 'electron';
import jquery from 'jquery';
import devHelper from './vendor/electron_boilerplate/dev_helper';
import windowStateKeeper from './vendor/electron_boilerplate/window_state';

// Socket to server
var socket = require('socket.io-client')('http://localhost:8090');

const ipcMain = require('electron').ipcMain;
const fs = require('fs');
var _ = require('lodash');
// Special module holding environment variables which you declared
// in config/env_xxx.json file.
import env from './env';

var mainWindow;

var routingTable = {};

// Preserver of the window size and position between app launches.
var mainWindowState = windowStateKeeper('main', {
    width: 1000,
    height: 500
});

// Fakes
var server;
var historySaver;
var settingsReader;
var serverSocket;

var isConnectionUp = false;

function randomPostFix(len) {
    len = len < 1 ? 1 : len;
    var chars = 'abcdefghijklmnopqrstu1234567890';
    var id = '';
    for (var i = len-1; i >= 0; i--) {
        id += chars[Math.floor(Math.random()*chars.length)];
    };

    return id;
}

// Maybe later collapse these ipcMain listeners into one "dataRequest" listener
ipcMain.on('settings', function(event, arg) {
    // arg is always message identifier
    var settingsCopy = _.assign({}, settingsReader.getSettings());
    mainWindow.webContents.send('replyToMsg', {id: arg, data: settingsCopy, operationSuccess: true});
});

ipcMain.on('routingTable', function(event, arg) {
    // arg is always message identifier
    
    mainWindow.webContents.send('replyToMsg', {id: arg, data: getRoutingInfo(), operationSuccess: true});
});

ipcMain.on('history', function(event, arg) {
    var historyCopy = historySaver.readHistory();
    console.log("LENGTH: " + historyCopy.length);
    mainWindow.webContents.send('replyToMsg', {id: arg, data: historyCopy, operationSuccess: true});
});

ipcMain.on('newSettings', function(event, arg) {
    // arg is {id: msgID, data: data} type of object
    var operationSuccess = settingsReader.saveNewSettings(arg.data); // Returns false if write to disk fails
    mainWindow.webContents.send('replyToMsg', 
        {id: arg.id, 
         data: true, 
         operationSuccess: operationSuccess
     });
});

ipcMain.on('closeChat', function(event, arg) {
    closeChatWindowProgramatically(arg.data);
});

ipcMain.on('banClient', function(event, arg) {
    banClient(arg.data);
});

ipcMain.on('frontChat', function(event, arg) {
    tryToMoveChatWindowToFront(arg.data);
});

ipcMain.on('asynchronous-message', function(event, arg) {
    console.log(arg);
});

ipcMain.on('toggleChatWindows', function(event, arg) {
    var direction = arg.direction;
    var fromClient = arg.from;

    toggleChatWindows(direction, fromClient);
});

ipcMain.on('outgoingMsg', function(event, arg) {
    console.log(arg);
    var globalSettings = settingsReader.getSettings();
    var msgID = arg.msgID;
    var outGoingMsgObj = {
        toCustomer: arg.to,
        fromEntrepreneur: globalSettings.appOwner,
        msg: arg.msg,
        id: msgID,
    };
    server.sendMessage(outGoingMsgObj);
});

function informUserHeNeedsToRestart() {
    console.log("SEND RESTART REQ");
    mainWindow.webContents.send('restartRequired');
}


function toggleChatWindows(direction, fromClient) {
    console.log("TOGGLING CHAT WINDOWS");
    var clientKeys = getRoutingInfo();

    var i = clientKeys.indexOf(fromClient);
    if (i === -1) return false;

    i = i + (direction === 'left' ? -1 : 1);
    var len = clientKeys.length;
    if (i < 0) {
        toggleToChatWindow(clientKeys[len-1]);
    } else if (i >= len) {
        toggleToChatWindow(clientKeys[0]);
    } else {
        toggleToChatWindow(clientKeys[i]);
    }
}

function toggleToChatWindow(clientID) {
    if (!routingTable.hasOwnProperty(clientID)) return false;
    console.log("ACTUAL TOGGLE");
    routingTable[clientID].show();
}

function tryToMoveChatWindowToFront(clientID) {
    if (routingTable.hasOwnProperty(clientID)) {
        console.log("CLOSING CHAT WINDOW PROGRAMATICALLY")
        routingTable[clientID].show();
    }
}

function banClient(clientID) {
    server.banClient(clientID);
}

function closeChatWindowProgramatically(clientID) {
    console.log("CLOSE CHAT: " + clientID);
    console.log(routingTable);
    if (routingTable.hasOwnProperty(clientID)) {
        console.log("CLOSING CHAT WINDOW PROGRAMATICALLY")
        routingTable[clientID].close();
    }
}

function routingTableChange() {
    mainWindow.webContents.send('routingTableChange', getRoutingInfo());
}

function getRoutingInfo() {
    var keys = _.keys(routingTable);
    return keys.sort();
}

function setupSocketToServer(addr) {
    console.log(socketio);
    serverSocket = socketio.connect(addr);
}

function weAreInAsEntrepreneur(sitekey) {
    mainWindow.webContents.send('loggedInToServer', {success: true, sitekey: sitekey});
    var clients = _.keys(routingTable);
    _.each(clients, function(clientID) {
        var clientWindow = routingTable[clientID];
        clientWindow.webContents.send('connectionUp');
    });    
}

function authorizationFailed() {
    isConnectionUp = false;
    mainWindow.webContents.send('loggedInToServer', {success: false, sitekey: 0});
}

function connectionToServerLost() {
    isConnectionUp = false;
    console.log("CONNECTION LOST");
    mainWindow.webContents.send('connectionToServerLost');
    var clients = _.keys(routingTable);
    _.each(clients, function(clientID) {
        var clientWindow = routingTable[clientID];
        clientWindow.webContents.send('connectionDown');
    });
}

function clientLeft(clientID) {
    // Get client window and inform it
    console.log("REACTING TO CLIENT LEFT");
    if (routingTable.hasOwnProperty(clientID)) {
        var w = routingTable[clientID];
        w.webContents.send('clientLeft');
        var settings = settingsReader.getSettings();
        if (settings.autoCloseWindows) {
            setTimeout(function() {
                if (routingTable.hasOwnProperty(clientID)) {
                    routingTable[clientID].close();
                    delete routingTable[clientID];
                }

            }, 3000);
        }
    }
}

function receiveMsgFromServer(msgObj) {
    /*
    if (msgObj.tag === 'clientLeft') {
        var clientID = msgObj.clientID;
        clientLeft(clientID);
    } else if (msgObj.tag === 'newMsg') {

    }
    */
}

function setupSocketListeners() {
    socket.on('connect', function() {
        console.log("CONNECTION SUCCESS");
    });
    socket.on('identifyYourSelf', function() {
        console.log("IDENTIFY REQ RECEIVED");
        setTimeout(function() {
            var settings = settingsReader.getSettings();
            socket.emit('userIdentification', {sitesecret: settings.sitePassword, sitekey: settings.connectedToSite});
        }, 1000);

    });

    socket.on('welcomeIn', function(msgObj) {
        console.log("WE ARE IN");
        if (msgObj.isEntrepreneur) {
            isConnectionUp = true;
            weAreInAsEntrepreneur(msgObj.sitekey);
        }

    });

    socket.on('msgFromServer', function(msgObj) {
        console.log("MSG FROM SERVER");
        console.log(JSON.stringify(msgObj));
        if (msgObj.hasOwnProperty('tag') && !msgObj.hasOwnProperty('msgType')) {
            msgObj.msgType = msgObj.tag;
        }
        server.receiveMessage(msgObj);
        //receiveMsgFromServer(msgObj);
    });

    socket.on('authorizationFailed', function(msgObj) {
        console.log("AUTH FAIL");
        authorizationFailed();
    });

    socket.on('disconnect', function() {
        connectionToServerLost();
    });

    socket.on('reconnect', function() {
        console.log("RECONNECT SUCCESS");
    })
    /*
    setTimeout(function() {
        console.log("SIMULATING NETWORK GLITCH");
        socket.disconnect()   
    }, 8000);
    setTimeout(function() {
        console.log("NETOWRK BACK UP");
        socket.connect();   
    }, 18000);
    */    
}

app.on('ready', function () {

    setupSocketListeners();
    historySaver = new HistorySaver();
    server = new FakeServer(historySaver);
    settingsReader = new SettingsReader();
    
    

    server.onMessage(function(msgObj) {
        console.log(msgObj);
        if (msgObj.msgType === 'newMsg') {
            if (!routingTable.hasOwnProperty(msgObj.from)) {
                routingTable[msgObj.from] = new BrowserWindow({
                    x: mainWindowState.x+400,
                    y: mainWindowState.y,
                    width: 900,
                    height: 740
                });
                routingTable[msgObj.from].fromCustomer = msgObj.from;
                routingTable[msgObj.from].loadURL('file://' + __dirname + '/singlechat.html');
                routingTable[msgObj.from].openDevTools();
                routingTable[msgObj.from].webContents.on('did-finish-load', function() {
                    console.log("ONE CHAT LOADED!");
                    routingTable[msgObj.from].webContents.send('initialData', {msg: msgObj.msg, from: msgObj.from, connected: isConnectionUp});
                });

                routingTableChange();

                routingTable[msgObj.from].on('close', function() {
                    console.log("CLOSED WITH CUSTOMER: " + routingTable[msgObj.from].fromCustomer);
                    // We need to make sure reference to the closed window is lost
                    routingTable[msgObj.from] = null;
                    delete routingTable[msgObj.from];
                    routingTableChange();

                });

                routingTable[msgObj.from].on('focus', function() {
                    console.log("FOCUS INTO CUSTOMER: " + routingTable[msgObj.from].fromCustomer);
                    // We need to make sure reference to the closed window is lost
                    routingTable[msgObj.from].webContents.send('youAreNowFocused');

                });
            } else {
                routingTable[msgObj.from].webContents.send('newMsg', msgObj);
            }
            

        } else if (msgObj.msgType === 'confirm') {
            
            // Send to all windows - each window can decide if this confirmation belongs to him or not.
            for (var fromCustomer in routingTable) {
                if (routingTable.hasOwnProperty(fromCustomer)) {
                    routingTable[fromCustomer].webContents.send(msgObj.msgType, msgObj);
                }
            }
        } else if (msgObj.msgType === 'clientLeft') {
            var clientID = msgObj.clientID;
            clientLeft(clientID);
        } 

        



    });

    server.startGenerating();

    mainWindow = new BrowserWindow({
        x: mainWindowState.x,
        y: mainWindowState.y,
        width: mainWindowState.width,
        height: mainWindowState.height
    });

    if (mainWindowState.isMaximized) {
        mainWindow.maximize();
    }

    if (env.name === 'test') {
        mainWindow.loadURL('file://' + __dirname + '/spec.html');
    } else {
        mainWindow.loadURL('file://' + __dirname + '/app.html');
    }

    if (env.name !== 'production') {
        devHelper.setDevMenu();
        mainWindow.openDevTools();
    }

    mainWindow.on('close', function () {
        mainWindowState.saveState(mainWindow);
    });
});

app.on('window-all-closed', function () {

    app.quit();
});


var FakeServer = function(historySaver) {

    this.historySaver = historySaver;

    this.cb;

    this.fakeRecipients = [];

    this.onMessage = function(cb) {
        this.cb = cb;
    }

    this.sendMessage = function(msgObj) {

        setTimeout(function() {
            this.receiveMessage({
                msgType: 'confirm',
                msgID: msgObj.id,
                stamp: Date.now()
            });
        }.bind(this), Math.random()*1000+500);

        this.historySaver.newMsg({
            msgFrom: 'entrepreneur',
            conversationWith: msgObj.toCustomer,
            stamp: Date.now(),
            msg: msgObj.msg
        });


    }

    this.receiveMessage = function(msg) {
        if (this.cb) {
            this.cb(msg);
        }

        if (msg.msgType === 'newMsg') {
            this.historySaver.newMsg({
                msgFrom: 'client',
                conversationWith: msg.from,
                stamp: Date.now(),
                msg: msg.msg                
            });
        }
    }

    this.banClient = function(clientID) {
        // Only server knows IP address of this client
        console.log("BANNED");
    }

    this.startGenerating = function() {
        return;
        this.fakeOneMessage();
        setInterval(this.fakeOneMessage.bind(this), 2600);
    }

    this.getFakeRecipientID = function() {
        var chars = 'abcdefghijklmnopqrstu1234567890';
        var id = '';
        for (var i = 4; i >= 0; i--) {
            id += chars[Math.floor(Math.random()*chars.length)];
        };

        return id;
    }

    this.fakeOneMessage = function() {
        
        if (Math.random() > this.fakeRecipients.length*0.4999999) {
            this.fakeRecipients.push(this.getFakeRecipientID());
        }

        if (this.fakeRecipients.length === 0) return;

        var randomIdx = Math.floor(this.fakeRecipients.length * Math.random());
        var rec = this.fakeRecipients[randomIdx];
        setTimeout(function() {
            this.receiveMessage({
                msgType: 'newMsg',
                from: rec,
                stamp: Date.now(),
                msg: "Something totally random " + Math.floor(Math.random() * 10000)
            });
        }.bind(this), 0)
    }


}

function SettingsReader() {

    this.settings;
    this.filePath = './asiakaschatsettings.json';

    this.defaultSettings = {
        autoCloseWindows: true,
        appOwner: '_unknown_',
        visibleNameToClients: 'Entrepreneur',
        connectedToSite: '_unknown_',
        constantWriteToHistory: false,
        sitePassword: '12345678',
        soundAlarm: true
    };

    this.didPasswordOrSitekeyChange = function(oldSettings, newSettings) {
        console.log(oldSettings);
        console.log(newSettings);
        return oldSettings.connectedToSite !== newSettings.connectedToSite || oldSettings.sitePassword !== newSettings.sitePassword;
    }

    this.saveNewSettings = function(settingsObject) {

        console.log("SAVING SETTINGS");

        var currentSettings = this.getSettings();
        var currentSettingsCopy = _.clone(currentSettings);
        this.settings = _.assign(currentSettings, settingsObject);
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.settings), 'utf8');
        } catch(err){ 
            console.log("ERROR IN FILE SAVING");
            return false;
        }
        if (this.didPasswordOrSitekeyChange(currentSettingsCopy, settingsObject)) {
            // Inform system that we need to recontact
            informUserHeNeedsToRestart();
        }
        return true;
        

    }

    this.getSettings = function() {
        return _.clone(this.settings);
    }



    this.init = function() {
        this.createFileIfNotThere();
        this.settings = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));

    }

    this.createFileIfNotThere = function() {
        try{
            fs.statSync(this.filePath);
          }catch(err){
            if(err.code == 'ENOENT') {
                // File does not exist!
                fs.appendFileSync(this.filePath, JSON.stringify(this.defaultSettings), 'utf8');
            }
          }        
    }

    this.init();


}
/*
function HistoryReader() {
    this.historyConversations;

    this.filePath = './historyconversations.json';

    this.init = function() {
        this.createSettingsFileIfNotThere();
        //this.historyConversations = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));

    }

    this.createFileIfNotThere = function() {
        try{
            fs.statSync(this.filePath);
          }catch(err){
            if(err.code == 'ENOENT') {
                // File does not exist!
                fs.appendFileSync(this.filePath, JSON.stringify({stamp: '100000000', conversationWith: 'mr_test', msgFrom: 'client', msg: 'Hey test!'}) + ",", 'utf8');
            }
          }        
    }

    this.readHistory = function() {
        this.historyConversations = JSON.parse('[' + fs.readFileSync(this.filePath, 'utf8') + "]");
        return _.clone(this.historyConversations);
    }

    this.init();

}
*/
function HistorySaver() {

    this.filePath = './historyconversations.json';

    this.inMemoryChatStreams = {};

    this.init = function() {
        this.createFileIfNotThere();
        //this.historyConversations = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));

    }

    this.createFileIfNotThere = function() {
        try{
            fs.statSync(this.filePath);
          }catch(err){
            if(err.code == 'ENOENT') {
                // File does not exist!
                fs.appendFileSync(this.filePath, JSON.stringify({stamp: '100000000', conversationWith: 'mr_test', msgFrom: 'client', msg: 'Hey test!'}) + ",", 'utf8');
            }
          }        
    }

    this.readHistory = function() {
        var s = fs.readFileSync(this.filePath, 'utf8');
        s = _.trimEnd(s, ',');

        this.historyConversations = JSON.parse('[' + s + "]");
        return _.clone(this.historyConversations);
    }

    this.newMsg = function(msg) {
        fs.appendFileSync(this.filePath, JSON.stringify(msg) + ",", 'utf8');
    }

    this.flushAll = function() {

    }

    this.flushOne = function(customerID) {

    }

    this.init();
}
