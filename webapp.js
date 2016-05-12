/** Server **/

var express = require('express');
var mongodb = require('mongodb').MongoClient;
var bodyParser = require('body-parser');
var assert = require('assert'); // Unit Testing
var passwordHash = require('password-hash');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var https = require("https");

var app = express();
var app_port = 3000;
var db_url = 'mongodb://localhost/appdb';
var db;
var data;
var req;

app.use(bodyParser.json());
app.use(express.static('static'));
app.use(session({
	secret: 'K33p1tS3cr3t',
	//cookie: { maxAge: 2628000000 },
	store: new MongoStore({
		url: db_url,
		collection: 'mySessions',
	}),
	resave: false,
	saveUninitialized: true
}));



/**********************************************/
/**** Scraping API ****************************/
/**********************************************/



//Information for the REST call
var header = {"X-Apptweak-Key": "QS5NiFFrLERBRML_ptL208cJoWc"};
var options = {
	hostname: "api.apptweak.com",
	port: 443,
	path: "/ios/categories/6014/top.JSON",
	"rejectUnauthorized": false,
	method:"GET",
	headers: header
};

/**
 * Requesting scraped data from AppTweak. If successful,
 * it'll drop the old collection of data if any, and then 
 * insert the new scraped data.
 */ 
function requestToAppTweak() {
	req = https.request(options, function(res) {
		var responseBody =""; 
		console.log("Response from server started."); 
		console.log(`Server Status: ${res.statusCode}`); 
		console.log("Response Headers: %j", res.headers);
		res.setEncoding("UTF-8"); 
		//retrieve the data in chunks
		res.on("data", function(chunk) {
			responseBody += chunk; 
		});

		res.on("end", function(){
			//Once completed we parse the data in JSON format
			data = JSON.parse(responseBody);
			//Deleting old records to avoid overlaps
			db.collection("data").drop();
			//Route to insert data to our DB, temporary workaround
			db.collection("data").insertMany(data.content, function(err,result) {
				//We insert the content portion of our JSON data and display it
				// res.json(data.content); 
				// console.log(result);
			}); 
		});
	});
	
	req.on("error", function(err) {
		console.log(`problem with request: ${err.message}`);
	});
	req.end();
}

//Route to display the information on the table -> filtering is work in progress
app.get('/api/bugs', function(req,res){
	// console.log("Query string", req.query);
	var filter = {};
	if(req.query.title)
		filter.title = req.query.title;
	if(req.query.developer)
		filter.developer = req.query.developer;

	db.collection("data").find(filter).toArray(function(err,docs) {
		res.json(docs); 
	});
});

//POST request from demo -> Not in use currently
app.post('/api/bugs/', function(req, res) {
	console.log("Req body:", req.body);
	var newBug = req.body;
	newBug.id = bugData.length + 1;
	bugData.push(newBug);
	res.json(newBug);
});

/**********************************************/
/**** Login Authentication ********************/
/**********************************************/

// Sends back the user's role from the session
app.post('/api/getRole', function(req, res) {
	res.json({"role": req.session.role});
});

// Inserts a user into the "users" collection db
// user: username, password, role
// @param {req} form.username, form.password
app.post('/api/signup/', function(req, res) {
	var username = { "username" : req.body.username };
	var newUser = {
		"username" : req.body.username,
		"password" : passwordHash.generate(req.body.password),
		"role" : "user"
	}; 
	// Checking if there's duplicate username
	db.collection("users").find(username).next(function(err, doc) {
		assert.equal(null, err);
		if(doc == null) { // Valid user
			// Inserting the user into the database
			db.collection("users").insertOne(newUser, function(err, doc) {
				assert.equal(null, err);
				res.json(newUser);
			});
		} else { // null => found duplicate
			res.json(null);
		}
	});
	
});

// Checks if the username and password is in the database and logs the user in 
// if its in the database.
// @param {req} form.username, form.password
app.post('/api/login/', function(req, res) {
	var username = req.body.username;
	var username_query = { "username" : username};
	
	db.collection("users").find(username_query).next(function(err, doc) {
		assert.equal(null, err);
		if(doc != null && passwordHash.verify(req.body.password, doc.password)) {
			req.session.username = doc.username;
			req.session.role = doc.role;
			res.json(doc);
		} else {
			res.json(null); // No username found or password does not match
		}
		
	});
});

// Logs out the logged user and destroys the session
app.post('/api/logout',function(req,res){
	req.session.destroy();
	res.end();
});

// Relogs an user that hasn't logout and it's in the session
app.post('/api/relog', function(req, res) {
	var session = {
		"username": req.session.username,
		"role": req.session.role
	};
	if(req.session.username != null) {
		res.json(session);
	} else {
		res.json(null);
	}	
});
	
// Connecting to the database
mongodb.connect(db_url, function(err, dbConnection) {
	assert.equal(null, err);
	db = dbConnection;	
	// Starting the server
	requestToAppTweak(); // Get scraped data and insert to db
	var server = app.listen(app_port, function() {
		console.log('> Application listening on port ' + app_port + '!');
	});
});
