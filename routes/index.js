var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'A lovely day' });
});

router.post('/setConfigs', function(sReq, sRes){
    console.log(sReq.body);
    sRes.send("done");
});

module.exports = router;
