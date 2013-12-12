var aws = require("aws-sdk");
var express = require("express");
var fs = require("fs");
var haml = require("hamljs");
var oauth = require("googleapis");
var path = require('path');

var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
aws.config.update(config.aws_cred);
var bucket = config.bucket;
var oauth_domain = config.oauth_domain;
var oauth_client = new oauth.OAuth2Client(config.oauth.client_id, config.oauth.client_secret, config.oauth.redirect_url);

var app = express();
var s3 = new aws.S3();
var dynamo = new aws.DynamoDB({'region':config.dynamo.region, 'accessKeyId':config.aws_cred.accessKeyId, 'secretAccessKey':config.aws_cred.secretAccessKey});

var list_template = fs.readFileSync('templates/list.haml', 'utf8');
var login_template = fs.readFileSync('templates/login.haml', 'utf8');

app.use(express.cookieParser());
app.use(express.session({secret: config.session_secret}));
app.use(express.static(path.join(__dirname, 'public')));

function bounceIfNotDomain(token, domain, callback, bounce_callback){
	var tmp_client = new oauth.OAuth2Client(config.oauth.client_id, config.oauth.client_secret, config.oauth.redirect_url);
	tmp_client.credentials = {'access_token':token};
    oauth.discover('oauth2','v2').execute(function(err,client){
        client.oauth2.userinfo.get().withAuthClient(tmp_client).execute(function(err, data){
        	if (data.hd != domain || data.verified_email != true){
                bounce_callback();
        	} else {
        		callback(data.email);
        	}
        });
    });
}

function generateDirectoryList(contents){
	var files=[];
	var directories=[];
    var id=1;
    for (var c in contents){
       var f = contents[c].Key;
       var dirs = f.split('/');
       // Is this a directory? Ignore it
       if (dirs.slice(-1) == "") continue;
       for (var i=0; i<dirs.length; i++){
           if (dirs[i] != directories[i]){
           	   var name = dirs.slice(i,i+1).join('/');
           	   var file = {'Key':name, 'id':id};
           	   if (i < dirs.length-1) name += '/';
           	   else file.Path = f;
           	   file.stepDown = directories.length-(i+1);
           	   file.Size = Math.round(contents[c].Size/1024);
           	   files.push(file);
               for (var j=i+1; j<dirs.length; j++){
               	   var name = dirs.slice(j,j+1).join('/');
               	   var file = {'Key':name, 'stepUp':id};
                   id++;
               	   if (j<dirs.length-1) name+="/";
               	   else {
               	      file.Path = f;
               	      file.Size = Math.round(contents[c].Size/1024);
               	   }
                   files.push(file);
               }
               directories = dirs;
               break;
            }
        }
    }
    return files;
}

function upvoteFile(email, key, callback){
    dynamo.getItem({TableName:config.dynamo['upvote_table'], Key:{'File Key':{S:key}}}, function(err, data){
    	var newSum = 0;
        var downvotes = ['fake'];
        var upvotes =['fake'];
    	if (typeof(data.Item) != 'undefined'){
            upvotes = data.Item.Upvotes.SS;
            newSum = parseInt(data.Item.Sum.N);
            downvotes = data.Item.Downvotes.SS;
            upvotes = data.Item.Upvotes.SS;   	    
    	}
    	var uv_index = upvotes.indexOf(email);
    	if (uv_index > 0) {
    		callback({'error':'Already upvoted'});
    		return;
    	}
    	var dv_index = downvotes.indexOf(email);
    	if (dv_index > -1){
            downvotes.splice(dv_index);
            newSum += 1;
        }
        newSum +=1;
        upvotes.push(email);
    	dynamo.updateItem({TableName:config.dynamo['upvote_table'], Key:{'File Key':{S:key}}, AttributeUpdates:{'Sum':{Value:{N:newSum.toString()}, Action:'PUT'}, 'Upvotes':{Value:{SS:upvotes}, Action:'PUT'}, 'Downvotes':{Value:{SS:downvotes}, Action:'PUT'}}}, function(err, data){
    	    if (err) callback({'error':err});
            else callback({'success':true});
        });
    });
}

function downvoteFile(email, key, callback){
    dynamo.getItem({TableName:config.dynamo['upvote_table'], Key:{'File Key':{S:key}}}, function(err, data){
    	var newSum = 0;
        var downvotes = ['fake'];
        var upvotes =['fake'];
    	if (typeof(data.Item) != 'undefined'){
            upvotes = data.Item.Upvotes.SS;
            newSum = parseInt(data.Item.Sum.N);
            downvotes = data.Item.Downvotes.SS;
            upvotes = data.Item.Upvotes.SS;   	    
    	}
    	var dv_index = downvotes.indexOf(email);
    	if (dv_index > 0) {
    		callback({'error':'Already downvoted'});
    		return;
    	}
    	var uv_index = upvotes.indexOf(email);
    	if (uv_index > -1){
            upvotes.splice(uv_index);
            newSum -= 1;
        }
        newSum -= 1;
        downvotes.push(email);
    	dynamo.updateItem({TableName:config.dynamo['upvote_table'], Key:{'File Key':{S:key}}, AttributeUpdates:{'Sum':{Value:{N:newSum.toString()}, Action:'PUT'}, 'Upvotes':{Value:{SS:upvotes}, Action:'PUT'}, 'Downvotes':{Value:{SS:downvotes}, Action:'PUT'}}}, function(err, data){
    	    if (err) callback({'error':err});
            else callback({'success':true});
        });
    });
}

function viewFile(email, key){
    
}

function dynamoHandler(votes, email, callback, data){
	for (var d in data.Items){
			var upvoted = (data.Items[d].Upvotes.SS.indexOf(email) > -1);
			var downvoted = (data.Items[d].Downvotes.SS.indexOf(email) > -1);
			votes[data.Items[d]['File Key'].S] = {'sum':data.Items[d]['Sum'].N, 'upvoted':upvoted, 'downvoted':downvoted};
	}
	if (data.LastEvaluatedKey != null){
		console.log(data.LastEvaluatedKey);
        continueGetVoteScan(votes, email, data.LastEvaluatedKey, callback);
	} else{
        callback(votes);
    }
}

function continueGetVoteScan(votes, email, lastKey, callback){
   dynamo.scan({TableName:config.dynamo['upvote_table'], ExclusiveStartKey:lastKey}, function(err, data){
       dynamoHandler(email, callback, data);
   });
}

function getVotes(email, callback){
	var votes={};
	dynamo.scan({TableName:config.dynamo['upvote_table']}, function(err, data){
		dynamoHandler(votes, email, callback, data);
	});
    
}

function bounceOAuth(res,source){
  res.redirect(oauth_client.generateAuthUrl({'access_type':'offline', 'scope':'https://www.googleapis.com/auth/userinfo.email', 'hd':'pythian.com', 'state':source}));
}

app.get('/', function(req,res,next){
	bounceOAuth(res, '/list');
});

app.get('/oauth2callback', function(req,res,next){
	if (req.query.error){
		res.send("Error in OAuth!"+req.query.error)
	} else {
        oauth_client.getToken(req.query.code, function(err, tokens){
            req.session.token = tokens.access_token;
            console.log("State: "+req.query.state);
           res.redirect(req.query.state);
        });
    }
});

app.get('/profile', function(req,res,next){
    if (req.session.token){
        getUserEmail(req.session.token, function(err, me){
            res.send(me);
        })
    }
});

app.get('/list', function(req, res, next){
	if (req.session.token){
        bounceIfNotDomain(req.session.token, oauth_domain, 
        	function(email){
                s3.listObjects({"Bucket":bucket}, function(err, data){
    	        if (err == null) {
    	            var files = generateDirectoryList(data.Contents);
    	            getVotes(email, function(data){
    		            res.send(haml.render(list_template, {locals: {'Contents':files, 'votes':data}}));
    		        });
    	        } else {
    		        console.log(err);
    	        }
            });
        }, function(){
            bounceOAuth(res, '/list');
        });
    } else {
    	res.redirect('/');
    }
});

app.get(/upvote\/(.+)/, function(req, res, next){
	if (req.session.token){
        bounceIfNotDomain(req.session.token, oauth_domain, 
        	function(email){
                upvoteFile(email, req.params[0], function(message){
                	console.log(message);
                	res.redirect('/list');
                });
            }, function(){
            	bounceOAuth(res, '/list');
           });
    } else {
    	res.redirect('/');
    }
});

app.get(/downvote\/(.+)/, function(req, res, next){
	if (req.session.token){
        bounceIfNotDomain(req.session.token, oauth_domain, 
        	function(email){
                downvoteFile(email, req.params[0], function(message){
                	console.log(message);
                	res.redirect('/list');
                });
            }, function(){
            	bounceOAuth(res, '/list');
           });
    } else {
    	res.redirect('/');
    }
});

app.get(/files\/(.+)/, function(req, res, next){
	if (req.session.token){
        bounceIfNotDomain(req.session.token, oauth_domain, 
        	function(email){
        		viewFile(email, req.params[0]);
                res.redirect(s3.getSignedUrl('getObject', {"Bucket":bucket, "Key":req.params[0], "Expires":config.duration}));
            }, function(){
            	bounceOAuth(res, '/files/'+req.params[0]);
           });
    } else {
    	bounceOAuth(res, '/files/'+req.params[0]);
    }
});

app.listen(process.env.PORT || 4567);


