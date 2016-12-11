var express = require('express');
var exif = require('exif');
var path = require('path');
var fs = require("fs");
var gm = require('gm');
var sizeOf = require('image-size');
var Twit = require('twit');
var config = require('./config');
var FB = require('fb');
var request = require('request');
var index    = require('./routes/index');


var T = new Twit({
  consumer_key:         config.twitter.consumer_key,
  consumer_secret:      config.twitter.consumer_secret,
  access_token:         config.twitter.access_token,
  access_token_secret:  config.twitter.access_token_secret,
  timeout_ms:           config.twitter.timeout_ms,  // optional HTTP request timeout to apply to all requests.
})


var app = express();
var bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));
app.use(express.static(__dirname + "public"));


// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

app.use('/index',  index);


app.post('/setConfigs', function(sReq, sRes){
    var email = sReq.query.email;
    console.log(email);
});

app.get('/', function (req, res) {
    res.render('index', { title: 'Express' });
})

if(config.facebook.active){
    FB.api('oauth/access_token', {
        client_id: config.facebook.app_token,
        client_secret: config.facebook.app_secret,
        grant_type: 'client_credentials'
    }, function (res) {
        if(!res || res.error) {
            console.log(!res ? 'error occurred' : res.error);
            return;
        }

        //var accessToken = res.access_token;
        FB.setAccessToken(config.facebook.access_token);
        createPhotoAlbumId();
    });
}


function createPhotoAlbumId() {
    FB.api(
        "me/albums", 'post', {name: config.facebook.album_name, message: config.facebook.album_description},
        function (response) {
            if(!response || response.error) {
                console.log(!response ? 'error occurred' : response.error);
                return;
            }
            if (response && !response.error) {
                console.log('Album Id for this event:'+response.id);
            }
        }
    );
}

// Watch directory for changes then perform some action
require('chokidar').watch('./photos', {ignored: /[\/\\]\./}).on('add', function(event, photoPath) {
  var basename = path.basename(event);
  var watermarkX = 0;
  var watermarkY = 0;
  var watermarkPath = __dirname + config.paths.watermark_basename;
  var ExifImage = exif.ExifImage;
  var watermarkDirectoryPath = __dirname + config.paths.watermark_directory;


    try {
        new ExifImage({ image : __dirname + '/photos/'+basename }, function (error, exifData) {
            if (error){
                console.log('Error: '+error.message);
            }
            else {
                // Do something with your data!
                var dimensions = sizeOf(watermarkPath);
                // determine image orientation and size
                if (isPhotoOrientationPortrait(exifData)) {
                    watermarkX = 0;
                    watermarkY = exifData.exif.ExifImageHeight - (dimensions.height + 100);
                    var watermarkPortraitPath = buildPortraitWatermarkPath();
                    gm(watermarkPath).rotate('green',90).write(watermarkPortraitPath, function(e){
                        var command = [];
                        command.push("image Over ", watermarkX, ",", watermarkY, " 0,0 ", watermarkPortraitPath);
                        var graphicMagicCommand = command.join("");
                        addWatermarkToPhoto(graphicMagicCommand);
                    });
                } else if (isPhotoOrientationLandscape(exifData)) {
                    console.log('photo is landscape');
                    watermarkX = exifData.exif.ExifImageWidth - (dimensions.width + 100);
                    watermarkY = exifData.exif.ExifImageHeight - (dimensions.height + 100);
                    var command = [];
                    command.push("image Over ", watermarkX, ",", watermarkY, " 0,0 ", watermarkPath);
                    var graphicMagicCommand = command.join("");
                    addWatermarkToPhoto(graphicMagicCommand);
                }
            }
        });
    } catch (error) {
        console.log('Error: ' + error.message);
    }

    function isPhotoOrientationPortrait(exifData) {
        return exifData.image.Orientation == 8 || exifData.image.Orientation == 4;
    }

    function isPhotoOrientationLandscape(exifData) {
        return exifData.image.Orientation == 1 || exifData.image.Orientation == 5;
    }

    function buildPortraitWatermarkPath() {
        var watermarkPortraitBaseNameTmp = path.basename(watermarkPath, path.extname(watermarkPath));
        var watermarkPortraitBaseName = watermarkPortraitBaseNameTmp + 'Portrait';
        var watermarkPortraitPath = __dirname + "/" + watermarkPortraitBaseName + path.extname(watermarkPath);
        return watermarkPortraitPath;
    }

    function addWatermarkToPhoto(command) {
        gm(__dirname + '/photos/' + basename)
            .draw(command)
            .write('' + __dirname + '/waterMarkedPhotos/' + basename, function (e) {
                console.log('Successfully added watermark to '+'' + __dirname + '/waterMarkedPhotos/' + basename);
                if(config.twitter.active){
                    postMediaToTwitter();
                }
                if (config.facebook.active){
                    postMediaToFacebook();
                }
            });
    }

    function postMediaToTwitter() {
        var b64content = fs.readFileSync(watermarkDirectoryPath + basename, {encoding: 'base64'})
        console.log('beginning twitter upload: ' +watermarkDirectoryPath + basename)

        T.post('media/upload', {media_data: b64content}, function (err, data, response) {
            // now we can assign alt text to the media, for use by screen readers and
            // other text-based presentations and interpreters
            console.log('error: '+err);
            var mediaIdStr = data.media_id_string
            var altText = "Some photo that I uploaded"
            var meta_params = {media_id: mediaIdStr, alt_text: {text: altText}}

            T.post('media/metadata/create', meta_params, function (err, data, response) {
                console.log('error: '+err);
                if (!err) {
                    // now we can reference the media and post a tweet (media will attach to the tweet)
                    var params = {status: config.twitter.hashtag, media_ids: [mediaIdStr]}

                    T.post('statuses/update', params, function (err, data, response) {
                        console.log(data)
                    })
                }
            })
        })
    }

    function postMediaToFacebook() {
        FB.api('oauth/access_token', {
            client_id: config.facebook.app_token,
            client_secret: config.facebook.app_secret,
            grant_type: 'client_credentials'
        }, function (res) {
            if(!res || res.error) {
                console.log(!res ? 'error occurred' : res.error);
                return;
            }

            FB.api(
                "me/albums",
                function (response) {
                    if (response && !response.error) {
                        for (var name in response.data) {
                            if (response.data.hasOwnProperty(name)) {
                                var val = response.data[name];
                                console.log(val.name);
                                if(val.name == config.facebook.album_name){
                                    FB.api(''+val.id+'/photos', 'post', { source: fs.createReadStream(watermarkDirectoryPath + basename), caption: config.facebook.caption }, function (res) {
                                        if(!res || res.error) {
                                            console.log(!res ? 'error occurred' : res.error);
                                            return;
                                        }
                                        console.log('Post Id: ' + res.post_id);
                                    });
                                }
                            }
                        }
                    }
                }
            );
        });
    }
});

app.listen(5000, function () {
    console.log('Example app listening on port 3000!')
})

module.exports = app;
