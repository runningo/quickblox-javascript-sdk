/*
 * QuickBlox JavaScript SDK
 *
 * WebRTC Module (WebRTC signaling)
 *
 */

require('../../../lib/strophe/strophe.min');
var Helpers = require('./qbWebRTCHelpers'),

var WEBRTC_MODULE_ID = 'WebRTCVideoChat';

function WebRTCSignaling(service, connection) {
  this.service = service;
  this.connection = connection;

  this._onMessage = function(stanza) {
    var from = stanza.getAttribute('from'),
        extraParams = stanza.querySelector('extraParams'),
        delay = stanza.querySelector('delay'),
        userId = self.helpers.getIdFromNode(from),
        extension = self._getExtension(extraParams);

    var sessionId = extension.sessionID;

    if (delay || extension.moduleIdentifier !== WEBRTC_MODULE_ID) return true;

    // clean for users
    delete extension.moduleIdentifier;

    switch (extension.signalType) {
    case signalingType.CALL:
      trace('onCall from ' + userId);

      if (sessions[sessionId]) {
      	trace('skip onCallListener, a user already got it');
      	return true;
      }

      // run caller availability timer and run again for this user
      clearAnswerTimer(sessionId);
      if(peer == null){
        startAnswerTimer(sessionId, self._answerTimeoutCallback);
      }
      //

      sessions[sessionId] = {
        sdp: extension.sdp
      };

      extension.callType = extension.callType === '1' ? 'video' : 'audio';
      delete extension.sdp;

      if (typeof self.onCallListener === 'function'){
        self.onCallListener(userId, extension);
      }

      break;
    case signalingType.ACCEPT:
      trace('onAccept from ' + sessionId);

      clearDialingTimerInterval(sessionId);
      clearCallTimer(userId);

      if (typeof peer === 'object')
        peer.onRemoteSessionCallback(extension.sdp, 'answer');
      delete extension.sdp;
      if (typeof self.onAcceptCallListener === 'function')
        self.onAcceptCallListener(userId, extension);
      break;
    case signalingType.REJECT:
      trace('onReject from ' + sessionId);

      clearDialingTimerInterval(sessionId);
      clearCallTimer(userId);

      self._close();
      if (typeof self.onRejectCallListener === 'function')
        self.onRejectCallListener(userId, extension);
      break;
    case signalingType.STOP:
      trace('onStop from ' + sessionId);

      clearDialingTimerInterval(sessionId);
      clearCallTimer(userId);

      clearSession(sessionId);

      self._close();
      if (typeof self.onStopCallListener === 'function')
        self.onStopCallListener(userId, extension);
      break;
    case signalingType.CANDIDATE:
      if (typeof peer === 'object') {
        peer.addCandidates(extension.iceCandidates);
        if (peer.type === 'answer')
          self._sendCandidate(peer.opponentId, peer.iceCandidates);
      }
      break;
    case signalingType.PARAMETERS_CHANGED:
      trace('onUpdateCall from ' + userId);
      if (typeof self.onUpdateCallListener === 'function')
        self.onUpdateCallListener(userId, extension);
      break;
    }

    // we must return true to keep the handler alive
    // returning false would remove it after it finishes
    return true;
  };

  this._getExtension = function(extraParams) {
    var extension = {}, iceCandidates = [], opponents = [],
        candidate, oponnent, items, childrenNodes;

    if (extraParams) {
      for (var i = 0, len = extraParams.childNodes.length; i < len; i++) {
        if (extraParams.childNodes[i].tagName === 'iceCandidates') {

          // iceCandidates
          items = extraParams.childNodes[i].childNodes;

          for (var j = 0, len2 = items.length; j < len2; j++) {
            candidate = {};
            childrenNodes = items[j].childNodes;
            for (var k = 0, len3 = childrenNodes.length; k < len3; k++) {
              candidate[childrenNodes[k].tagName] = childrenNodes[k].textContent;
            }
            iceCandidates.push(candidate);
          }

        } else if (extraParams.childNodes[i].tagName === 'opponentsIDs') {

          // opponentsIDs
          items = extraParams.childNodes[i].childNodes;
          for (var j = 0, len2 = items.length; j < len2; j++) {
            oponnent = items[j].textContent;
            opponents.push(oponnent);
          }

        } else {
          if (extraParams.childNodes[i].childNodes.length > 1) {

            extension = self._XMLtoJS(extension, extraParams.childNodes[i].tagName, extraParams.childNodes[i]);

          } else {

            extension[extraParams.childNodes[i].tagName] = extraParams.childNodes[i].textContent;

          }
        }
      }
      if (iceCandidates.length > 0)
        extension.iceCandidates = iceCandidates;
      if (opponents.length > 0)
        extension.opponents = opponents;
    }

    return extension;
  };

}

WebRTCSignaling.SignalingType = {
   CALL: 'call',
   ACCEPT: 'accept',
   REJECT: 'reject',
   STOP: 'hangUp',
   CANDIDATE: 'iceCandidates',
   PARAMETERS_CHANGED: 'update'
};

WebRTCSignaling.prototype.sendCandidate = function(userId, iceCandidates, extension) {
  var extension = extension || {};
  extension[iceCandidates] = iceCandidates;

  this.sendMessage(userId, extension, WebRTCSignaling.SignalingType.CANDIDATE);
};

WebRTCSignaling.prototype.sendMessage = function(userId, extension, signalingType) {
  var extension = extension || {},
      self = this,
      msg, params;

  // basic parameters
  //
  extension.moduleIdentifier = WEBRTC_MODULE_ID;
  extension.signalType = signalingType;
  // extension.sessionID
  // extension.callType
  extension.platform = 'web';
  extension.callerID = Helpers.getIdFromNode(this.connection.jid);
  // extension.opponentsIDs;
  // extension.sdp

  params = {
    from: this.connection.jid,
    to: Helpers.getUserJid(userId, this.service.getSession().application_id),
    type: 'headline',
    id: Utils.getBsonObjectId()
  };

  msg = $msg(params).c('extraParams', {
    xmlns: Strophe.NS.CLIENT
  });

  Object.keys(extension).forEach(function(field) {
    if (field === 'iceCandidates') {

      // iceCandidates
      msg = msg.c('iceCandidates');
      extension[field].forEach(function(candidate) {
        msg = msg.c('iceCandidate');
        Object.keys(candidate).forEach(function(key) {
          msg.c(key).t(candidate[key]).up();
        });
        msg.up();
      });
      msg.up();

    } else if (field === 'opponentsIDs') {

      // opponentsIDs
      msg = msg.c('opponentsIDs');
      extension[field].forEach(function(opponentId) {
        msg = msg.c('opponentID').t(opponentId).up();
      });
      msg.up();

    } else if (typeof extension[field] === 'object') {

      self._JStoXML(field, extension[field], msg);

    } else {
      msg.c(field).t(extension[field]).up();
    }
  });

  this.connection.send(msg);
};

// TODO: the magic
WebRTCSignaling.prototype._JStoXML = function(title, obj, msg) {
  var self = this;
  msg.c(title);
  Object.keys(obj).forEach(function(field) {
    if (typeof obj[field] === 'object')
      self._JStoXML(field, obj[field], msg);
    else
      msg.c(field).t(obj[field]).up();
  });
  msg.up();
};

// TODO: the magic
WebRTCSignaling.prototype._XMLtoJS = function(extension, title, obj) {
  var self = this;
  extension[title] = {};
  for (var i = 0, len = obj.childNodes.length; i < len; i++) {
    if (obj.childNodes[i].childNodes.length > 1) {
      extension[title] = self._XMLtoJS(extension[title], obj.childNodes[i].tagName, obj.childNodes[i]);
    } else {
      extension[title][obj.childNodes[i].tagName] = obj.childNodes[i].textContent;
    }
  }
  return extension;
};

module.exports = WebRTCSignaling;