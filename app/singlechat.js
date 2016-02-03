// Here is the starting point for your application code.
// All stuff below is just to show you how it works. You can delete all of it.

// Use new ES6 modules syntax for everything.
import os from 'os'; // native node.js module
import { remote } from 'electron'; // native electron module
import jetpack from 'fs-jetpack'; // module loaded from npm
import { greet } from './hello_world/hello_world'; // code authored by you in this project
import env from './env';
import jquery from 'jquery';
import moment from 'moment';
var _ = require('lodash')
const ipcRenderer = require('electron').ipcRenderer;

var FROM_CUSTOMER; // Holds reference to what customer this window is talking to
var FROM_CUSTOMER_SCREENNAME // Screen name of the customer because internal name is too long
var autoScrollState = true; // Whether auto scroll is on or off

var pendingOutgoingMessages = [];

ipcRenderer.on('asynchronous-reply', function(event, arg) {
  console.log(arg); // prints "pong"
});

ipcRenderer.on('initialData', function(event, arg) {
  console.log("INITIAL DATA IN RENDERER:");
  console.log(arg); // prints "pong"
  FROM_CUSTOMER = arg.from;
  FROM_CUSTOMER_SCREENNAME = arg.from.split("_")[0];
  initialConnectionStatus(arg.connected);
  document.getElementById('withWhom').innerHTML = "Single chat with " + FROM_CUSTOMER_SCREENNAME;
  showClientMsg(arg.msg);
});

ipcRenderer.on('newMsg', function(event, arg) {
  console.log("NEW MSG DATA IN RENDERER:");
  console.log(arg); // prints "pong"
  showClientMsg(arg.msg);
});

ipcRenderer.on('confirm', function(event, arg) {
	console.warn("CONFIRM ARRIVED");
	console.log(arg);
	// Confirmation of entrepreneur's msg arrival to client
	var confirmedMsgIdx = _.findIndex(pendingOutgoingMessages, function(msg) {
		return msg.msgID === arg.msgID;
	});

	if (confirmedMsgIdx !== -1) {
		var confirmedMsg = pendingOutgoingMessages[confirmedMsgIdx];
		pendingOutgoingMessages.splice(confirmedMsgIdx, 1);
		confirmMsgInUL(confirmedMsg);
	}


});

ipcRenderer.on('youAreNowFocused', function(_event, _arg) {
	focusToInputField();
});

ipcRenderer.on('connectionDown', function() {
	addConnectionDownMsg();
});

ipcRenderer.on('connectionUp', function() {
	connectionBackUp();
});

ipcRenderer.on('clientLeft', function() {
	clientLeft();
});

ipcRenderer.on('rateLimitViolation', function() {
	rateLimitViolation();
})

document.onkeydown = function(e) {
	console.log("KEY PRESS");
	var evtobj = window.event ? event : e;
	console.log(evtobj.keyCode);
	if (evtobj.keyCode == 37 && evtobj.shiftKey) {
		ipcRenderer.send('toggleChatWindows', {direction: 'left', from: FROM_CUSTOMER});
	} else if (evtobj.keyCode === 39 && evtobj.shiftKey) {
		ipcRenderer.send('toggleChatWindows', {direction: 'right', from: FROM_CUSTOMER});
	}
}

document.addEventListener('DOMContentLoaded', function () {
	console.log("NOTHING in CHAT");
	console.log(jquery('body'));
	updateAutoScrollText();
	ipcRenderer.send('asynchronous-message', {to: 6});
});


document.getElementById('msgInputForm').addEventListener('submit', function(e) {
	e.preventDefault();
	console.log("JOOO");
	sendOutgoing();
});

document.getElementById('autoScroll').addEventListener('click', function(e) {
	changeAutoScroll();
});

document.getElementById('msgInput').addEventListener('input', function() {
	showRemainingChars(document.getElementById('msgInput').value);
	console.log("CHANGE IN MSGH");
});

function rateLimitViolation() {
	var ul = document.getElementById('msgUL');
	var html = '<li class="systemInfo">Msg rate too high (slow down!)</li>';
	ul.innerHTML += html;

	updateScrollIfNeeded();	
}

function showRemainingChars(textInput) {
	var rem = 512 - _.trim(textInput).length;
	var span = document.getElementById('remainingCharsSpan');
	span.className = 'suitableLength';
	if (rem === 512) {
		// Nothing written
		span.innerHTML = '';
	} else if(rem > -1) {
		span.innerHTML = rem + ' chars remaining';
	} else {
		span.className = 'tooLong';
		span.innerHTML = 'Too long input!';
	}
}


function clientLeft() {
	document.getElementById('msgInput').style.display = 'none';
	document.getElementById('connectionDownSpan').style.display = 'none';
	document.getElementById('clientLeftSpan').style.display = 'block'
	

}

function initialConnectionStatus(isConnected) {
	if (isConnected) {
		connectionBackUp();
	} else {
		addConnectionDownMsg();
	}
}

function connectionBackUp() {

	document.getElementById('connectionDownSpan').style.display = 'none';
	document.getElementById('clientLeftSpan').style.display = 'none';
	document.getElementById('msgInput').style.display = 'block';
}

function addConnectionDownMsg() {
	document.getElementById('msgInput').style.display = 'none';
	document.getElementById('clientLeftSpan').style.display = 'none';
	document.getElementById('connectionDownSpan').style.display = 'block';
}

function focusToInputField() {
	setTimeout(function() {
			document.getElementById('msgInput').focus();
	}, 100);
}

function changeAutoScroll(newState) {
	if (newState !== undefined) {
		autoScrollState = !!newState;
	} else {
		autoScrollState = !autoScrollState;
	}

	updateAutoScrollText();
}

function updateAutoScrollText() {
	document.getElementById('autoScroll').innerHTML = autoScrollState ? "Auto scroll is on" : "Auto scroll is off";
}

function updateScrollIfNeeded() {
	if (!autoScrollState) return;
	console.log("UPDATING SCROLL ");
	jquery('#msgUL').scrollTop(jquery('#msgUL')[0].scrollHeight);
	jquery('#msgULHolder').scrollTop(jquery('#msgULHolder')[0].scrollHeight);
}

function randomPostFix(len) {
    len = len < 1 ? 1 : len;
    var chars = 'abcdefghijklmnopqrstu1234567890';
    var id = '';
    for (var i = len-1; i >= 0; i--) {
        id += chars[Math.floor(Math.random()*chars.length)];
    };

    return id;
}

function sendOutgoing() {
	console.log("SEND OUTGOING MSG FROM SINGLE CHAT!");
	var msgID = FROM_CUSTOMER + "_" + Date.now() + "_" + randomPostFix(6);
	var msg = {
		msgType: 'newMsg',
		msgID: msgID,
		msg: document.getElementById('msgInput').value,
		to: FROM_CUSTOMER
	};
	console.log(msg);
	if (!msg.msg || _.trim(msg.msg) === '') return;
	document.getElementById('msgInput').value = '';
	pendingOutgoingMessages.push(msg);
	pushPendingToUL(msg);
	ipcRenderer.send('outgoingMsg', msg);

}

function setCheckerTimeoutForMessage(arg) {
	console.log("SET CHECKER: " + arg);
	setTimeout(function() {

		console.log("RUN CHECKER");
		console.log(pendingOutgoingMessages.length);
		var confirmedMsgIdx = _.findIndex(pendingOutgoingMessages, function(msg) {
			return msg.msgID === arg.msgID;
		});
		if (confirmedMsgIdx !== -1) {
			// Probably should not wait anymore
			console.log("FOUND DEAD");
			var msg = pendingOutgoingMessages[confirmedMsgIdx];
			pendingOutgoingMessages.splice(confirmedMsgIdx, 1);
			markAsPotentiallyLost(arg.msgID);
		}
	}, 5000);
}

function pushPendingToUL(msg) {
	var ul = document.getElementById('msgUL');
	var html = '<li id="' + msg.msgID + '" class="entrepreneur"><span class="entrepreneurName"><p class="senderName">You</p></span>';
	html += '<p class="chatmsg">' + msg.msg + '</p><span class="waitingconfirmation">Waiting...</span></li>';
	ul.innerHTML += html;
	setCheckerTimeoutForMessage(msg);

	updateScrollIfNeeded();

}

function markAsPotentiallyLost(msgID) {
	console.log("LOST MARKING");
	var li = document.getElementById(msgID);
	var label = li.querySelector('.waitingconfirmation');	

	if (li) {
		label.className = 'potentiallyLost';
		label.innerHTML = 'Failed';
		li.className = 'potentiallyLost';
	}


}

function confirmMsgInUL(msg) {
	var li = document.getElementById(msg.msgID);
	var label = li.querySelector('.waitingconfirmation');
	if (li) {
		console.warn("CLASS NAME CHANGED!");
		//li.className = "ownconfirmed";
		label.className = 'showConfirmTime';
		label.innerHTML = getBeautifiedTimeString(msg.stamp);
	}
}

function showClientMsg(msg) {
	var html = '<li class="client"><span class="clientName"><p class="senderName">Client</p></span>';
	html += '<p class="chatmsg">' + msg + '</p><span class="showConfirmTime">' + getBeautifiedTimeString(msg.stamp) + '</span></li>';
	document.getElementById('msgUL').innerHTML += html;
	updateScrollIfNeeded();
}

function getBeautifiedTimeString(stamp) {

	var timeMoment = moment(stamp);
	return timeMoment.format('HH:mm');



}


