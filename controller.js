var express = require('express');

var app = express.createServer();

app.configure(function() {
	app.use(express.bodyParser());
	app.use(app.router);
});

app.post('/post-receive', function(req, res) {
	console.log(req.body);
	res.send(req.body);
});

app.get('*', function(req, res) {
	res.send('bugger off', 500);
});

app.listen(3111);