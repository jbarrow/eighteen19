
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

/**
 * Password Hashing Data
 */

var strLen = 128;
var iterations = 12000;

function hash(pwd, salt, fn) {
	if (arguments.length == 3) {
		crypto.pbkdf2(pwd, sald, iterations, len, fn);
	} else {
		fn = salt;
		crypto.randomBytes(len, function(err, salt) {
			if (err) return fn(err);
			salt = salt.toString('base64');
			crypto.pbkdf2(pwd, salt, iterations, len, function(err, hash) {
				if (err) return fn(err);
				fn(null, salt, hash);
			});
		});
	}
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
	console.log(username);
	console.log(pass);
	console.log(os);
	console.log(browser);
	var user = db.users.findOne({ 'username' : username }, function(err, user) {
		console.log(err);
		console.log(user);
	});
	if(!user) return fn(new Error('Looks like something went wrong.  Different computer?  Bad password?'));

	if(user.os != '' && user.browser != '') {
		hash(pass, user.salt, function(err, hash) {
			if(err) return fn(err);
			if(hash == user.hash) return fn(null, user);
			fn(new Error('Looks like something went wrong.  Different computer?  Bad password?'));
		})
	} else {
		hash(pass, user.salt, function(err, hash) {
			if(err) return fn(err);
			if(hash == user.hash && os = user.os && browser = user.browser) return fn(null, user);
			fn(new Error('Looks like something went wrong.  Different computer?  Bad password?'));
		})
	}

}

function restrict(req, res, next) {
	if (req.session.user) {
		next();
	} else {
		req.session.error = 'You must sign in first';
		res.redirect('/');
	}
}

app.get('/', function(req, res) {
	res.render('index', { username: '', captcha: '' });
});

app.get('/login', function(req, res) {
	res.render('index', { username: '', captcha: '' });
});

app.get('/logout', function(req, res) {
	req.session.destroy(function() {
		res.redirect('/');
	});
});

app.post('/login', function(req, res) {
	var ua = uaParser.parse(req.headers['user-agent']);
	authenticate(req.body.username, req.body.password, req.body.captcha, ua.os, ua.family, function(err, user) {
		if(user) {
			req.session.regenerate(function(){
				req.session.user = user;
				req.session.success = 'Congratulations!';
				res.redirect('files');
			});
		} else {
			req.session.error = 'Something went wrong.';
			res.render('index', { username: req.body['username'], captcha: req.body['captcha'] });
		}
	});	
});

app.get('/files', function(req, res) {});

app.get('/authorize/:hash', function(req, res) {});

app.get('/open/:hash', function(req, res) {});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
