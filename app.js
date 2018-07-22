const express = require('express'), //express 框架 
       wechat  = require('./wechat/wechat'), 
       config = require('./config');//引入配置文件

var app = express();
var wechatApp = new wechat(config); //实例wechat 模块
//用于处理所有进入 1234 端口 get 的连接请求
app.get('/',function(req,res){
	wechatApp.auth(req,res);

});
//用于请求获取 access_token
app.get('/getAccessToken',function(req,res){
    wechatApp.getAccessToken().then(function(data){
        res.send(data);
    });    
});
//所有post请求
app.post('/',function(req,res){
	 wechatApp.handleMsg(req,res);
    
});

app.listen(1234);