var moment = require('moment');
var Sequelize = require('sequelize');
var Client = require('./client.js');

var CLIENT_USER = process.env.USER;
var CLIENT_PASS = process.env.PASS;


var TYPE_REMINDER = 0;
var TYPE_FOOD = 1;
var TYPE_SONG = 2;

var sequelize = new Sequelize('zulip', 'root', '', {
  host: "localhost",
  port: 3306
});


var MessageRequest = sequelize.define('message_request', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sender: Sequelize.STRING,
  recipients: Sequelize.STRING,
  message: Sequelize.STRING,
  type: Sequelize.INTEGER,
  alarm_time: Sequelize.DATE,
});

var _users = {};
var client = new Client(CLIENT_USER, CLIENT_PASS);


// client.sendStreamMessage('test-bot', 'paulbot', 'hi', 
//   function(resp) {
//     console.log('success');
//     console.log(resp);
//   }, function(err) {
//     console.log('error');
//     console.log(err);
//   });
  
// client.sendPrivateMessage('paulwang727@gmail.com', 'hi', 
//   function(resp) {
//     console.log('success');
//     console.log(resp);
//   }, function(err) {
//     console.log('error');
//     console.log(err);
//   });


client.onStreamMessage(function(data) {
  console.log('received stream message');
  console.log(data);
});


var getSudoResponse = function(fromName, sudoPos, content) {
  if (Math.random() > 0.5) {
    respStr = content.substr(sudoPos+4, content.length);
    resp = [fromName, ", why don't you ", respStr, "!" ].join('');
  }
  else {
    resp = ["Sorry, user", fromName, "does not have root priviledges"].join(' ');
  }
  
  return resp;
};

var getResponse = function(fromName) {
  var resp = '';
  var rand = Math.random();

  if (rand < 0.33) {
    resp = ["Oh, hello", fromName, "I'll be right on it."].join(' ');
  }
  else if (rand < 0.66) {
    resp =["Well, ", fromName + ",", "I'm a tad busy but I will try my best."].join(' ');
  } else {
    resp = ["A little needy, ", fromName + ",", "aren't we? Oh lighten up, I'll get right on it."].join(' ');
  }
  
  return resp;
};

var getImmediateResponse = function(from, fromName, content) {
  var strIndex = content.indexOf("sudo");
  var resp = (strIndex > -1) ? 
    getSudoResponse(fromName, strIndex, content) : 
    getResponse(fromName)
  
  return resp;
};

var getUserEmail = function(name) {
  return _users[name].email;
};

var parseUserName = function(name) {
  var regex = /[^@\*\*]+(?=\*\*$)/g;
  return regex.exec(name)[0];
}


var getUserEmails = function(from, people) {
  var emails = [];
  var peopleArr = people.split(',');
  var personName = '';
  
  for(var i=0, len=peopleArr.length; i<len; i++) {
    if (peopleArr[i] === 'me'){
      emails.push(from);      
    }
    else {
      personName = parseUserName(peopleArr[i]);
      emails.push(getUserEmail(personName));
    }
  }
  
  return emails;
};

var handleReminder = function(from, content) {
  // remind <PEOPLE> that <MESSAGE> in <LOCATION> @<TIME> 
  content = content.substring(7, content.length);
  
  var splitReminder = content.split(':');
  
  var people = splitReminder[0];
  var subject = splitReminder[1];
  var location = splitReminder[2];
  var timeVal = splitReminder[3];
  var recipients = getUserEmails(from, people).join(',');
  
  //me, @**Paul Wang (F'13)**, @**Paul Wang (F'13)**
  var message = [subject, 'in', location].join(' ');
  MessageRequest.create({
    sender: from,
    recipients: recipients,
    message: message,
    type: TYPE_REMINDER,
    alarm_time: moment(timeVal, "HH").toDate(),
  }).success(function() {
    console.log('successfully added message request');
  });
};


client.onPrivateMessage(function(data) {
  var from = data.sender_email;
  var fromFullName = data.sender_full_name;
  var fromName = (fromFullName.split(' ').splice(0,2)).join(' ');
  var content = data.content;
  
  if (content.indexOf('remind') === 0) {
    handleReminder(from, content);
  }
  
  // var resp = getImmediateResponse(from, fromName, content);
  //   client.sendPrivateMessage(from, resp, function(){}, function(){});
});


client.onPresence(function(data) {
  console.log('received presence change for ' + data.email);
});


var getEvents = function() {
  client.getEvents(true, 
    function(resp) {
      setTimeout(function() {
        getEvents();
      }, 5000);
      
    }, function(err) {
      console.log('ERROR getEvents');
      console.log(JSON.stringify(err));
      
      setTimeout(function() {
        registerQueue();
      }, 5000);
    });
};


var registerQueue = function() {
  client.registerQueue(['message'], false, 
    function(resp) {
      client.queueId = resp.queue_id;
      client.lastEventId = resp.last_event_id;
      getEvents();
    }, 
    function(err) {
      console.log('ERR');
      console.log(err)
    }
  );
};



var sendRequest = function(request) {
  var recipients = request.recipients.split(',');
  
  for(var i, len=recipients.length; i<len; i++) {
    client.sendPrivateMessage(
      recipients[i], request.message, 
      function(resp) {
        request.alerted = 1;
        request.save().success(function() {
          console.log('sent message request for ' + request.id);
        });
      }, function(err) {
        console.log('error');
        console.log(err);
      });
  }
};

var handleOpenRequests = function(requests) {
  for(var i=0, len=requests.length; i<len; i++) {
    sendRequest(requests[i]);
  }
}

var findOpenRequests = function() {
  var currTime = moment()
  MessageRequest.findAll({
    where: { 
      alerted:0, 
      alarm_time: { lte: moment().toDate() } 
    }
  }).success(handleOpenRequests);
  
  setTimeout(function() {
    findOpenRequests();
  }, 5000);
};

findOpenRequests();




client.getUsers(function(data) {
  var members = data.members;
  
  console.log('SUCCESS getUsers');
  
  for(var i=0, len=members.length; i<len; i++) {
    _users[members[i].full_name] = {
      isBot: members[i].is_bot,
      isActive: members[i].is_active,
      fullName: members[i].full_name,
      email: members[i].email
    }
  }
  
  // make call to register queue
  registerQueue();

}, function(err) {
  console.log('ERROR');
  console.log(err)
})