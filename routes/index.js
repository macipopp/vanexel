var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Van Exel' });
});

router.post('/setConfigs', function(sReq, sRes){
    console.log(sReq.body);
    var app = require('../app')(sReq.body);
    app.RunProcess();
    sRes.send("Van Exel has started successfully and is awaiting your changes...");

});

module.exports = router;
