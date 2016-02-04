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
const ipcRenderer = require('electron').ipcRenderer;
var _ = require('lodash');
var Joi = require('joi');
// Dynamically load HTML views into DOM
jquery('#statuspanel').load("views/statuspanel.html");
jquery('#settings').load("views/settings.html");
jquery('#history').load("views/history.html");


console.log('Loaded environment variables:', env);

var app = remote.app;
var appDir = jetpack.cwd(app.getAppPath());

var notificationHandler = new Notifications(document.getElementById('notifications'));
var mediator = new Mediator(notificationHandler);
var viewHandler = new ViewHandler(mediator);


// Holy crap! This is browser window with HTML and stuff, but I can read
// here files like it is node.js! Welcome to Electron world :)
//console.log('The author of this app is:', appDir.read('package.json', 'json').author);

document.addEventListener('DOMContentLoaded', function () {
	viewHandler.registerView('settings', document.getElementById('settings'), new SettingsView(document.getElementById('settings'), mediator));
	viewHandler.registerView('history', document.getElementById('history'), new HistoryView(document.getElementById('history'), mediator));
	viewHandler.registerView('statuspanel', document.getElementById('statuspanel'), new StatusView(document.getElementById('statuspanel'), mediator));

	//viewHandler.registerView('settings', document.getElementById('settings'));

	console.log("NOTHING");
	ipcRenderer.on('replyToMsg', function(event, replyObject) {
		mediator.msgFromBrowser(replyObject);
	});

	ipcRenderer.on('routingTableChange', function(event, routingData) {
		console.warn("RENDERER GOT ROUTING TABLE CHANGE");
		mediator.trigger('routingTableChange', routingData);
	});

	ipcRenderer.on('loggedInToServer', function(event, msgObj) {
		mediator.amILoggedInToServer(msgObj);
	});

	ipcRenderer.on('restartRequired', function() {
		console.log("RESTART RQE");
		mediator.restartRequired();
	});

	ipcRenderer.on('connectionToServerLost', function() {
		mediator.connectionToServerLost();
	});

	ipcRenderer.on('playNewWindowSound', function() {
		console.log("PLAYING SOUND IN MAIN WINDOW");
		var snd = new Audio("sounds/newWindow.wav");
		snd.play();
	});


   
});

var mainmenubar = document.getElementById('mainmenubar');

mainmenubar.addEventListener('click', function(e) {
	console.log(e.target.dataset.menuaction);
	var menuaction = e.target.dataset.menuaction;

	if (menuaction) {
		var targetSpan = jquery(e.target);
		targetSpan.addClass('active');
		targetSpan.siblings('span').removeClass('active');
		viewHandler.changeToView(menuaction);
	
	}
});

function StatusView(element, mediator) {
	this.element = element;
	this.mediator = mediator;

	this.activeNow = false;

	this.init = function() {
		console.log("SUBSCRIBE TO ROUTING CHANGES BY STATUS VIEW")
		this.mediator.subscribeTo('routingTableChange', this.updateRoutingView.bind(this));

		jquery(this.element).on('click', function(e) {
			console.log("CLICK ON Status VIEW");
			var targetEl = jquery(e.target);

			var targetAction = targetEl.attr('data-tableAction');
			console.log(targetAction);	
			if (targetAction === 'front') {
				var clientID = targetEl.attr('data-whoIsClient');
				this.sendRequestToFrontChatWindow(clientID);
			} else if (targetAction === 'close') {
				var clientID = targetEl.attr('data-whoIsClient');
				this.sendRequestToCloseChatWindow(clientID);
			} else if (targetAction === 'ban') {
				var clientID = targetEl.attr('data-whoIsClient');
				this.sendRequestToBanClient(clientID);
			} else if (targetAction === 'unban') {
				var clientID = targetEl.attr('data-whoIsClient');
				this.sendRequestToUnBanClient(clientID);				
			}
		}.bind(this));

	}

	this.show = function() {
		console.log("Show statuspanel")
		this.activeNow = true;
		// Perhaps contact with server getting live info about stuff and stuff
		var prom = this.mediator.requireData('routingTable');
		prom.then(function(data) {
			console.warn("PROMISE RESOLVED In Status view!!!");
			console.log(data);
			console.log("REDRAW NEXT");
			console.log(this);
			this.redrawMe(data);
			console.log("REDRAW PREV");
		}.bind(this));			

	}

	this.hide = function() {
		console.log("Hiding status view")
		this.activeNow = false;

	}
	this.redrawMe = function(routingData) {

		console.log("ACTIVE NOW: " + this.activeNow);
		if (!this.activeNow) {
			// Too late, user has already changed view
			return false;
		}		
		this.updateRoutingView(routingData);

	}

	this.sendRequestToFrontChatWindow = function(clientID) {
		var prom = this.mediator.passData('frontChat', clientID);
	}

	this.sendRequestToCloseChatWindow = function(clientID) {
		var prom = this.mediator.passData('closeChat', clientID);
	}

	this.sendRequestToBanClient = function(clientID) {
		var prom = this.mediator.passData('banClient', clientID);
	}
	this.sendRequestToUnBanClient = function(clientID) {
		var prom = this.mediator.passData('unBanClient', clientID);
	}
	this.updateRoutingView = function(routingData) {
		console.warn("UPDATING ROUTING VIEW");
		console.log(routingData);
		this.buildRoutingTable(routingData);
	}

	this.buildRoutingTable = function(routingData) {
		// Contains info whether banned or not
		// array of items {key: key, banned: boolean}
		if (!routingData) {

			routingData = [];
		}
		console.log("Routing data in table builder");
		console.log(routingData);
		var html = '';
		routingData = _.sortBy(routingData, function(client) {
			return client;
		});
		_.each(routingData, function(clientObj) {
			var client = clientObj.key;
			var isBanned = clientObj.banned;
			var banAction = isBanned ? 'unban' : 'ban';
			var banText   = isBanned ? 'Salli' : 'Estä';
			html += "<tr>";
			html += "<td style='text-align: center;'>" + client + "</td>";
			html += "<td><button class='btn btn-primary btn-sm' data-tableAction='front' data-whoIsClient='" + client + "'>Tuo Eteen</button></td>";
			html += "<td><button class='btn btn-danger btn-sm' data-tableAction='close' data-whoIsClient='" + client + "'>Sulje</button></td>"; 
			html += "<td><button class='btn btn-default btn-sm' data-tableAction='" + banAction + "' data-whoIsClient='" + client + "'>" + banText + "</button></td>"; 
			html += "</tr>";
		});

		jquery(this.element).find('#routingTableBody').empty().append(html);
		

	}

	this.init();


}

function SettingsView(element, mediator) {
	this.element = element;
	this.mediator = mediator;

	this.activeNow = false;

	this.formSubmitHandler;

	this.settingsSchema = Joi.object().keys({
		visibleNameToClients: Joi.string().min(1).max(12).required(),
		connectedToSite: Joi.string().alphanum().min(8).max(8).required(),
		sitePassword: Joi.string().alphanum().min(7).max(7).required(),
		autoCloseWindows: Joi.boolean(),
		constantWriteToHistory: Joi.boolean(),
		soundAlarm: Joi.boolean()
	});
	this.settingsSchemaToHumanReadable = {
		visibleNameToClients: 'Asiakkaalle näkyvä nimesi',
		connectedToSite: 'Sivuavain',
		sitePassword: 'Sivusalana',
		autoCloseWindows: 'Chat-ikkunan autom. sulkeminen',
		constantWriteToHistory: 'Viestien tallennus levylle',
		soundAlarm: 'Äänimerkki keskustelun alkaessa'
	};
	this.validateSettingsInput = function(settingsObject) {
		var fieldThatFailed = 0;
		console.log("VALIDATING SETTINGS INPUT");
		Joi.validate(settingsObject, this.settingsSchema, function(err, value) {
			if (err) {
				console.error("VALID FAIL");
				console.log(err.details);
				console.log(value);
				fieldThatFailed = err.details[0].path;
			}
		});

		return fieldThatFailed;

	}

	this.initSubmitHandler = function() {
		var container = jquery(this.element);
		var form = container.find("#settingsform");
		console.log(container);
		console.log("FORM ELEMENT");
		console.log(form);

		form.on('submit', function(e) {
			console.log("SUBMIT FORM");
			e.preventDefault();
			var settingsObject = {};
			settingsObject.visibleNameToClients = container.find('#screenname_input').val();
			settingsObject.connectedToSite = container.find('#sitekey_input').val();
			settingsObject.sitePassword = container.find('#sitepassword_input').val();
			settingsObject.autoCloseWindows = container.find('#autoclose_select').val() === 'yes';
			settingsObject.constantWriteToHistory = container.find('#conversationstofile_select').val() === 'yes';
			settingsObject.soundAlarm = container.find('#soundalarms_select').val() === 'yes';
			console.log(settingsObject);
			var failedField = this.validateSettingsInput(settingsObject);
			if (failedField !== 0) {
				console.log("FAILED FIELD: " + failedField);
				this.mediator.notification('warning', 'Virheellinen syöte kenttään: ' + this.settingsSchemaToHumanReadable[failedField]);
				return false;
			}


			var prom = this.mediator.passData('newSettings', settingsObject);
			prom.done(function() {
				this.mediator.notification('success', 'Asetusten tallennus onnistui!');
				this.getDataAndRedraw();
			}.bind(this));

			prom.fail(function() {
				this.mediator.notification('danger', 'Asetusten tallennus epäonnistui!');
				this.getDataAndRedraw();
			}.bind(this));
		}.bind(this));
	}

	this.show = function() {
		if (!this.formSubmitHandler) this.initSubmitHandler();
		this.activeNow = true;
		console.log("SettingsView asking for settings to be shown!");
		this.getDataAndRedraw();
	}

	this.getDataAndRedraw = function() {
		var prom = this.mediator.requireData('settings');
		prom.then(function(data) {
			console.warn("PROMISE RESOLVED!!!");
			console.log(data);
			this.redrawMe(data);
		}.bind(this));		
	}

	this.redrawMe = function(data) {
		if (!this.activeNow) {
			// Too late, user has already changed view
			return false;
		}
		console.log("REDRAWING SETTINGS VIEW");
		// Get refs to relevant DOM elements
		var container = jquery(this.element);
		var screenNameInput = container.find('#screenname_input');
		var siteKeyInput = container.find('#sitekey_input');
		var sitePasswordInput = container.find('#sitepassword_input');
		var autoCloseSelect = container.find('#autoclose_select');
		var saveConversationsSelect = container.find('#conversationstofile_select');
		var soundAlarmsSelect = container.find('#soundalarms_select');

		autoCloseSelect.val(data.autoCloseWindows ? "yes" : "no");
		screenNameInput.val(data.visibleNameToClients);
		siteKeyInput.val(data.connectedToSite);
		sitePasswordInput.val(data.sitePassword);
		saveConversationsSelect.val(data.constantWriteToHistory ? "yes" : "no");
		soundAlarmsSelect.val(data.soundAlarm ? "yes" : "no");

		//jquery(this.element).find('')
	}

	this.hide = function() {
		this.activeNow = false;
		// Do some clean up if needed
	}


}
function HistoryView(element, mediator) {
	this.element = element;
	this.mediator = mediator;

	this.activeNow = false;

	this.conversationsCache;

	this.init = function() {

		jquery(this.element).on('click', function(e) {
			console.log("CLICK ON HISTORY VIEW");
			var targetEl = jquery(e.target);
			if (targetEl.prop('tagName').toUpperCase() === 'TD') {
				targetEl = targetEl.parent('tr');
			}

			console.log(targetEl);
			var targetAction = targetEl.attr('data-chatAction');
			if (targetAction === 'sortingchange') {
				console.log("WAS TH");
				var criteria = targetEl.data('sortingcriteria');
				var parts = criteria.split('|');
				this.changeSortingOfTable(parts[0], parts[1]);
			} else if (targetAction === 'openconversation') {
				var convID = targetEl.data('convwith');
				this.openSingleConversation(convID);

			}
		}.bind(this));


	}

	this.show = function() {
		this.activeNow = true;
		jquery(this.element).find('#singleConversationHistory').hide();
		jquery(this.element).find('#historyList').show();
		console.log("HistoryView asking for settings to be shown!");
		var prom = this.mediator.requireData('history');
		prom.then(function(data) {
			console.warn("HISTORY PROMISE RESOLVED!!!");
			console.log(data);
			this.redrawMe(data);
		}.bind(this));
	}

	this.openSingleConversation = function(conversationWith) {

		jquery(this.element).find('#historyList').hide();
		this.populateSingleConversation(conversationWith);
		jquery(this.element).find('#singleConversationHistory').show();

	}

	this.getBeautifiedTimeString = function(stamp) {

		var timeMoment = moment(stamp);
		return timeMoment.format('HH:mm');



	}

	this.createClientLi = function(msg) {

		var html = '<li class="client"><span class="clientName"><p class="senderName">Asiakas</p></span>';
		html += '<p class="chatmsg">' + msg.msg + '</p><span class="showConfirmTime">' + this.getBeautifiedTimeString(msg.stamp) + '</span></li>';
		return html;
	}

	this.createOwnLi = function(msg) {
		var html = '<li id="' + msg.msgID + '" class="entrepreneur"><span class="entrepreneurName"><p class="senderName">Yrittäjä</p></span>';
		html += '<p class="chatmsg">' + msg.msg + '</p><span class="showConfirmTime">'+this.getBeautifiedTimeString(msg.stamp)+'</span></li>';
		return html;		
	}

	this.populateSingleConversation = function(conversationWith) {
		if (!this.conversationsCache) return false;
		var conversations = this.conversationsCache;

		var matchedConversation = _.find(conversations, function(conv) {
			return conv.conversationWith === conversationWith;
		});

		if (!matchedConversation) return false;

		var msgs = _.sortBy(matchedConversation.msgs, function(msg) {
			return msg.stamp;
		});

		console.log(msgs);

		var html = '';

		for (var i = msgs.length - 1; i >= 0; i--) {
			if (msgs[i].msgFrom === 'client') html += this.createClientLi(msgs[i]);
			else html += this.createOwnLi(msgs[i]);
		};
		console.log("HTML");
		console.log(html);
		console.log(jquery(this.element).find('#historyMsgUL'));
		if (conversationWith.indexOf('_') !== -1) {
			conversationWith = conversationWith.split('_')[0];
		}
		jquery(this.element).find('#historyWith').empty().append('Keskustelu: ' + conversationWith);
		jquery(this.element).find('#historyMsgUL').empty().append(html);



	}

	this.changeSortingOfTable = function(newSorting, ascOrDesc) {
		console.log(newSorting + " | " + ascOrDesc);
		if (!this.conversationsCache) return;
		this.redrawMeFromCache(newSorting, (ascOrDesc === 'desc'));

	}

	this.redrawMeFromCache = function(sortingCriteria, isReversed) {
		if (!this.activeNow) {
			// Too late, user has already changed view
			return false;
		}
		sortingCriteria = sortingCriteria || 'firstMsg';

		console.log(sortingCriteria + " | " + isReversed);

		var conversations = this.conversationsCache;
		conversations = _.sortBy(conversations, function(conv) {
			return conv[sortingCriteria];
		});
		if (isReversed) conversations = conversations.reverse();
		console.log(conversations);
		console.log(conversations[0].msgsLen + " | " + conversations[0].firstMsg);



		var tbody = jquery(this.element).find('#historyConversationsBody');
		var html = "";

		var i = 1;

		_.each(conversations, function(conversationObj, idx) {
			console.log(conversationObj.msgsLen);
			if (conversationObj.conversationWith && conversationObj.conversationWith.indexOf('_') > 1) {
				var screenName = conversationObj.conversationWith.split('_')[0];
			} else {
				var screenName = conversationObj.conversationWith;
			}
			
			html += "<tr data-chatAction='openconversation' data-convwith='" + conversationObj.conversationWith + "'><td>" + screenName + "</td><td>" + this.getBeautifiedDateTime(conversationObj.firstMsg) + "</td><td>" + conversationObj.msgs.length + "</td></tr>";
			++i;
		}.bind(this));

		tbody.empty().append(html);
	}

	this.redrawMe = function(data) {

		this.conversationsCache = this.groupIntoConversations(data);
		this.redrawMeFromCache();
	}

	this.groupIntoConversations = function(data) {

		var convs = {};

		for (var i = data.length - 1; i >= 0; i--) {
			var item = data[i];
			if (!convs.hasOwnProperty(item.conversationWith)) {
				convs[item.conversationWith] = {conversationWith: item.conversationWith, firstMsg: item.stamp, msgs: []};
			};

			convs[item.conversationWith].msgs.push(item);
			if (convs[item.conversationWith].firstMsg > item.stamp)	{
				convs[item.conversationWith].firstMsg = item.stamp;
			}
		};
		var convsArr = [];
		_.each(convs, function(conv, key) {
			conv.msgsLen = conv.msgs.length;
			convsArr.push(conv);
		});

		return convsArr;

	}

	this.hide = function() {
		this.activeNow = false;
		// Do some clean up if needed
	}

	this.getBeautifiedDateTime = function(stamp) {
		return moment(stamp).format("dddd, MMMM Do, HH:mm");

	}

	this.init();


}


function Mediator(notifications) {

	this.notifications = notifications;

	this.subscriptions = {};

	this.pendingRequestsToBrowserProcess = [];

	this.connectionToServerLost = function() {
		var menuElement = jquery('#menuElement');
		var spanEl = menuElement.find('#loggedInSpan');
		spanEl.removeClass('label-danger label-success').addClass('label-warning');
		spanEl.empty().append('Yhteys menetetty!');
		this.notification('danger', 'Yhteys palvelimeen menetetty! Yhdistetään uudelleen...');	
	}

	this.restartRequired = function() {
		console.log("RESTART REQUIRED");
		this.notification('warning', 'Asetukset tallennettu! Käynnistä sovellus uudestaan jotta asetukset tulevat voimaan!');
	}

	this.amILoggedInToServer = function(msgObj) {
		var success = msgObj.success;
		var sitekey = msgObj.sitekey;

		var menuElement = jquery('#menuElement');
		var spanEl = menuElement.find('#loggedInSpan');

		if (success) {
			this.notification('success', 'Olet kirjautunut sisään onnistuneesti!');
			spanEl.removeClass('label-warning label-danger').addClass('label-success');
			spanEl.empty().append('Kirjautunut: ' + sitekey);

		} else {
			this.notification('danger', 'Kirjautuminen epäonnistui - tarkista sivuavain ja sivusalasana!');
			spanEl.removeClass('label-success label-warning').addClass('label-danger');
			spanEl.empty().append('Ei kirjautunut');			
		}
	}

	this.subscribeTo = function(tag, cb) {

		if (!this.subscriptions.hasOwnProperty(tag)) {
			this.subscriptions[tag] = [];
		}

		this.subscriptions[tag].push(cb);

	}

	this.trigger = function(tag, data) {
		if (!this.subscriptions.hasOwnProperty(tag)) {
			return;
			throw "Unrecognized tag in Mediator trigger: " + tag;
		}
		_.each(this.subscriptions[tag], function(cb, key) {
			cb(data);
		});

	}

	this.triggerAsync = function(tag, data) {
		if (!this.subscriptions.hasOwnProperty(tag)) {
			throw "Unrecognized tag in Mediator trigger (async): " + tag;
		}
		setTimeout(function() {
			_.each(this.subscriptions[tag], function(cb, key) {
					cb(data);
			});	
		}.bind(this), 0);	
	}

	this.notification = function(tag, msg) {
		this.notifications.addMsg(tag, msg);
	}

	this.passData = function(dataTag, data) {

		var deferred = jquery.Deferred();

		var id = this.randomMsgIdentifier();
		deferred.waitingForMsgWithID = id;
		this.pendingRequestsToBrowserProcess.push(deferred);
		ipcRenderer.send(dataTag, {id: id, data: data});
		return deferred.promise();

	}

	this.requireData = function(dataTag) {
		var deferred = jquery.Deferred();


		var id = this.randomMsgIdentifier();
		deferred.waitingForMsgWithID = id;
		this.pendingRequestsToBrowserProcess.push(deferred);
		ipcRenderer.send(dataTag, id);
		return deferred.promise();
		
	}

	this.randomMsgIdentifier = function() {
		return Date.now() + "_" + Math.floor(Math.random() * (1000 * 1000));
	}

	this.msgFromBrowser = function(replyObject) {
		var msgID = replyObject.id;
		var data  = replyObject.data;
		var operationSuccess = replyObject.operationSuccess;

		var idx = _.findIndex(this.pendingRequestsToBrowserProcess, function(deferred) {
			return deferred.waitingForMsgWithID === msgID;
		});

		if (idx !== -1) {
			var deferred = this.pendingRequestsToBrowserProcess[idx];
			this.pendingRequestsToBrowserProcess.splice(idx, 1);
			if (operationSuccess) deferred.resolve(data);
			else deferred.reject(data);
		}
	}


}



function ViewHandler(mediator) {

	this.mediator = mediator;

	this.views = {};

	this.registerView = function(viewName, viewElement, viewModule) {
		this.views[viewName] = {el: viewElement, mod: viewModule};
	}

	this.changeToView = function(viewName) {
		for (var view in this.views) {
			if (this.views.hasOwnProperty(view)) {
				this.views[view].el.style.display = 'none';
				this.views[view].mod.hide();
			}
		}

		this.views[viewName].el.style.display = 'block';
		this.views[viewName].mod.show();
		this.mediator.trigger('viewChange', viewName);

	}

}

function Notifications(element) {
	this.element = element;

	this.defaultShowTime = 5000;
	this.removeHandler;

	this.tagOrder = ['success', 'warning', 'danger'];

	this.currentTag;

	this.addMsg = function(tag, msg) {
		if (this.removeHandler) {
			// Msg already visible
			if (!this.currentTag) clearTimeout(this.removeHandler);
			else {
				var currI = this.tagOrder.indexOf(this.currentTag);
				var nextI = this.tagOrder.indexOf(tag);
				if (currI === -1 || nextI >= currI) {
					clearTimeout(this.removeHandler);
				} else {
					// Lower msg id dumped
					return false;
				}
			}
		}
		msg = _.truncate(msg, {length: 96});
		var html = '<div class="alert alert-' + tag + '" role="alert" style="height: 24px; text-align: center; font-size: 16px; padding-top:0px;">' + msg + '</div>';
		jquery('#defaultFooter').hide();
		jquery(this.element).empty().append(html).show();
		this.currentTag = tag;

		this.removeHandler = setTimeout(this.emptyArea.bind(this), this.defaultShowTime);
	}

	this.emptyArea = function() {
		jquery(this.element).empty().hide();
		jquery('#defaultFooter').show();
		this.removeHandler = null;
		this.currentTag = null;
	}
}


