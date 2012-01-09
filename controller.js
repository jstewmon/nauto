var fs = require('fs');
var path = require('path');
var express = require('express');
var nconf = require('nconf');
var nodemailer = require('nodemailer');
var handlebars = require('handlebars');


function resolve() {
	var args = arguments;
	Array.prototype.unshift.call(args, __dirname);
	return path.resolve.apply(path, args);
}

function loadTemplateFile(name, cb) {
	fs.readFile(path.join(resolve('./templates'), name), 'utf8', function (err, data) {
		if (err) cb(err);
		else cb(null, data);
	});
}

// one time action to set up SMTP information
// nodemailer.SMTP = {
//     host: 'localhost'
// };
nodemailer.sendmail = '/usr/sbin/sendmail';
var app = express.createServer();

app.configure(function() {
	app.use(express.bodyParser());
	app.use(app.router);
});

app.post('/post-receive', function(req, res) {
	var payload = JSON.parse(req.body.payload);
	res.send('i parsed you');
	
	loadTemplateFile('post-receive.txt', function loadedTemplate(err, source) {
		if(err) {
			console.error(err);
		}
		else {
			var template = handlebars.compile(source);
			var output = template({payload: JSON.stringify(payload, null, 2)});
			
			console.log('output:');
			console.log(output);
			
			// send an e-mail
			nodemailer.send_mail(
			  // e-mail options
		    {
		        sender: 'jstewmon@gmail.com',
		        to:'jstewmon@glgroup.com',
		        subject:'post-receive hook called',
		        //html: '<p><b>Hi,</b> how are you doing?</p>',
		        body: output
		    },
		    // callback function
		    function(err, success) {
					if(err) {
						console.error('Failed to send message...');
						console.error(err);
					}
					else {
						console.log('Message sent');
					}
		    });
		}
	});
});

app.get('*', function(req, res) {
	res.send('bugger off', 500);
});

app.listen(3111);