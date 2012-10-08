
/**
 * Module dependencies.
 */

var express = require('express')
  , crypto = require('crypto')
  , uaParser = require('ua-parser')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path');

/**
 * Database information and connection
 */
var database = "1819";
var collections = ["users", "keys"];
var db = require("mongojs").connect(database, collections);
var users = db.collection('users');
var keys = db.collection('keys');

/**
 * Password Hashing Data
 */

var strLen = 128;
var iterations = 12000;

function generateSalt(callback) {
	crypto.randomBytes(64, function(err, buf) {
		if (err) throw err;
		callback(buf.toString('hex'));
	});
}

function hash(pwd, salt, callback) {
	crypto.pbkdf2(pwd, salt, iterations, strLen, function(err, password) {
		if (err) throw err;
		callback(password);
	});
}

/**
 * Application Code
 */

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');

  app.use(express.cookieParser('secret secret'));
  app.use(express.session());

  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.use(function(req, res, next) {
	var err = req.session.error, msg = req.session.success;
	delete req.session.error;
	delete req.session.sucess;
	res.locals.message = '';
	if (err) res.locals.message = '<p class="msg error">' + err + '</p>';
	if (msg) res.locals.message = '<p class="msg success">' + msg + '</p>';
	next();
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

function authenticate(username, pass, captcha, os, browser, fn) {
	var secure = db.keys.findOne({ 'key' : pass }, function(err, key) {
		// Email!
		
		if(!key) return;

		generateSalt(function(hash) {
			db.keys.update({ 'key' : key.key }, { $set : { 'hash' : hash, 'forward' : true }});
			return;
		});
	});

	var user = db.users.findOne({ 'username' : username, 'captcha' : captcha }, function(err, user) {
		if(!user) return fn(new Error('Looks like something went wrong.  Different computer?  Bad password?'));

		if(!user.os || !user.browser) {
			hash(pass, user.salt, function(hash) {
				if(hash == user.hash) { 
					db.users.update({ 'username' : user.username, 'hash' : user.hash }, { $set : { 'browser' : browser, 'os' : os } });
					return fn(null, user);
				}
				return fn(new Error('Looks like something went wrong.  Different computer?  Bad password?'));
			});
		} else {
			hash(pass, user.salt, function(hash) {
				if(hash == user.hash && os == user.os && browser == user.browser) return fn(null, user);
				return fn(new Error('Looks like something went wrong.  Different computer?  Bad password?'));
			});
		}
	});
}

function restrict(req, res, next) {
	if (req.session.user) {
		next();
	} else {
		req.session.error = 'You must sign in first';
		res.redirect('/');
	}
}

function conditionalForward(req, res, next) {
	var key = db.keys.findOne({ 'forward' : true }, function(err, key) {
		if(key) res.redirect('http://www.google.com');
		else next();
	});
}

function request(ref_user, email, username, fn) {
	var new_user = db.users.findOne({ 'username': username }, function(err, user) {
		if(user) return fn(new Error('Sorry, but your username has already been selected.  Choose a new one.'));
		

	});
}

app.get('/', conditionalForward, function(req, res) {
	res.render('index', { username: '', captcha: '', message: '', ref_user: '', email: '' });
});

app.get('/login', conditionalForward, function(req, res) {
	res.render('index', { username: '', captcha: '', message: '', ref_user: '', email: '' });
});

app.get('/logout', conditionalForward, function(req, res) {
	delete req.session.user;
	res.redirect('/');
});

app.get('/request', conditionalForward, function(req, res) {
	res.render('request', { ref_user: '', email: '', message: '', username: '' });
});

app.post('/request', conditionalForward, function(req, res) {

});

app.post('/login', conditionalForward, function(req, res) {
	var ua = uaParser.parse(req.headers['user-agent']);
	authenticate(req.body.username, req.body.password, req.body.captcha, ua.os, ua.family, function(err, user) {
		if(user) {
			req.session.regenerate(function(){
				req.session.user = user;
				res.redirect('files');
			});
		} else {
			res.render('index', { username: req.body['username'], captcha: req.body['captcha'], message: err, ref_user: '', email: '' });
		}
	});	
});

app.get('/files', conditionalForward, restrict, function(req, res) {
	res.render('files', { username: '', captcha: 'It Worked!', message: 'Congratulations, motherfucker!' });
});

app.get('/authorize/:hash', conditionalForward, function(req, res) {});

app.get('/open/:hash', function(req, res) {});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
