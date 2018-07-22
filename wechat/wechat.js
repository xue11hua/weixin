'use strict' //设置为严格模式
const crypto = require('crypto'), //引入加密模块
util = require('util'), //引入 util 工具包
accessTokenJson = require('./accessToken'), //引入本地存储的 access_token
fs = require('fs'), //引入 fs 模块
urltil = require('url'),//引入 url 模块
menus  = require('./menus'), //引入微信菜单配置
 parseString = require('xml2js').parseString,//引入xml2js包
 msg = require('./msg'),//引入消息处理模块
 path = require("path"),
 request = require("request"),
https = require('https'); //引入 htts 模块

//构建 WeChat 对象 即 js中 函数就是对象
var WeChat = function(config){
     //设置 WeChat 对象属性 config
    this.config = config;
    //设置 WeChat 对象属性 token
    this.token = config.token;
    //设置 WeChat 对象属性 appID
    this.appID = config.appID;
    //设置 WeChat 对象属性 appScrect
    this.appScrect = config.appScrect;
    //设置 WeChat 对象属性 apiDomain
    this.apiDomain = config.apiDomain;
    //设置 WeChat 对象属性 apiURL
    this.apiURL = config.apiURL;
    //天气
    this.weather = config.weather;

    
    //用于处理 https Get请求方法
    //  this.requestGet = function(url){
    //     return new Promise(function(resolve,reject){
    //         https.get(url,function(res){
    //             var buffer = [],result = "";
    //             //监听 data 事件
    //             res.on('data',function(data){
    //                 buffer.push(data);
    //             });
    //             //监听 数据传输完成事件
    //             res.on('end',function(){
    //                 result = Buffer.concat(buffer).toString('utf-8');
    //                 //将最后结果返回
    //                 resolve(result);
    //             });
    //         }).on('error',function(err){
    //             reject(err);
    //         });
    //     });
    // }
    // this.requestPost = function(url,data){
    //     return new Promise(function(resolve,reject){
    //         //解析 url 地址
    //         var urlData = urltil.parse(url);
    //         //设置 https.request  options 传入的参数对象
    //         var options={
    //             //目标主机地址
    //             hostname: urlData.hostname, 
    //             //目标地址 
    //             path: urlData.path,
    //             //请求方法
    //             method: 'POST',
    //             //头部协议
    //             headers: {
    //                 'Content-Type': 'application/x-www-form-urlencoded',
    //                 'Content-Length': Buffer.byteLength(data,'utf-8')
    //             }
    //         };
    //         var req = https.request(options,function(res){
    //             var buffer = [],result = '';
    //             //用于监听 data 事件 接收数据
    //             res.on('data',function(data){
    //                 buffer.push(data);
    //             });
    //              //用于监听 end 事件 完成数据的接收
    //             res.on('end',function(){
    //                 result = Buffer.concat(buffer).toString('utf-8');
    //                 resolve(result);
    //             })
    //         })
    //         //监听错误事件
    //         .on('error',function(err){
    //             console.log(err);
    //             reject(err);
    //         });
    //         //传入数据
    //         req.write(data);
    //         req.end();
    //     });
    // }

}


/**
 * 微信接入验证
 */
WeChat.prototype.auth = function(req,res){
	console.log(req.query);
	
	//使用 Post 请求创建微信菜单
	var that = this;
    this.getAccessToken().then(function(data){
        //格式化请求连接
        var url = util.format(that.apiURL.createMenu,that.apiDomain,data);
        //使用 Post 请求创建微信菜单
        that.requestPost(url,JSON.stringify(menus)).then(function(data){
            //将结果打印
            console.log(data);
        });
    });


     //1.获取微信服务器Get请求的参数 signature、timestamp、nonce、echostr
        var signature = req.query.signature,//微信加密签名
            timestamp = req.query.timestamp,//时间戳
                nonce = req.query.nonce,//随机数
            echostr = req.query.echostr;//随机字符串

        //2.将token、timestamp、nonce三个参数进行字典序排序
        var array = [this.token,timestamp,nonce];
        array.sort();

        //3.将三个参数字符串拼接成一个字符串进行sha1加密
        var tempStr = array.join('');
        const hashCode = crypto.createHash('sha1'); //创建加密类型 
        var resultCode = hashCode.update(tempStr,'utf8').digest('hex'); //对传入的字符串进行加密

        //4.开发者获得加密后的字符串可与signature对比，标识该请求来源于微信
        if(resultCode === signature){
            res.send(echostr);
        }else{
            res.send('mismatch');
        }
}

/**
 * 获取微信 access_token
 */
WeChat.prototype.getAccessToken = function(){
    var that = this;
    return new Promise(function(resolve,reject){
        //获取当前时间 
        var currentTime = new Date().getTime();
        //格式化请求地址
        var url = util.format(that.apiURL.accessTokenApi,that.apiDomain,that.appID,that.appScrect);
        //var url=api.accesstoken+'&appID='+that.appID+'&secret='+that.appScrect;
        //判断 本地存储的 access_token 是否有效
        if(accessTokenJson.access_token === "" || accessTokenJson.expires_time < currentTime){
            that.requestGet(url).then(function(data){
            	console.log(data);
                var result = JSON.parse(data); 
                if(data.indexOf("errcode") < 0){
                    accessTokenJson.access_token = result.access_token;
                    accessTokenJson.expires_time = new Date().getTime() + (parseInt(result.expires_in) - 200) * 1000;
                    //更新本地存储的
                    fs.writeFile('./wechat/accessToken.json',JSON.stringify(accessTokenJson));
                    //将获取后的 access_token 返回
                    resolve(accessTokenJson.access_token);
                }else{
                    //将错误返回
                    resolve(result);
                } 
            });
        }else{
            //将本地存储的 access_token 返回
            resolve(accessTokenJson.access_token);  
        }
    });
}

/**
 * 微信消息
 */
WeChat.prototype.handleMsg = function(req,res){
    var buffer = [],that = this;
    //监听 data 事件 用于接收数据
    req.on('data',function(data){
        buffer.push(data);
    });
    //监听 end 事件 用于处理接收完成的数据
    req.on('end',function(){
        var msgXml = Buffer.concat(buffer).toString('utf-8');
        //解析xml
        parseString(msgXml,{explicitArray : false},function(err,result){
            if(!err){
                result = result.xml;
                   var toUser = result.ToUserName; //接收方微信
                   var fromUser = result.FromUserName;//发送仿微信
                    var resultXml = "";
                   //判断事件类型
                   if(result.MsgType.toLowerCase() === "event"){
                        switch(result.Event.toLowerCase()){
                      case 'subscribe':
                             //回复消息
                             res.send(msg.txtMsg(fromUser,toUser,'欢迎关注 xue11hua 公众号'));
                             break;
                       case 'click':
                                var contentArr = [
                                    {Title:"css不定高图文垂直居中的三种方法",Description:"css不定高图文垂直居中的三种方法",PicUrl:"https://images2018.cnblogs.com/blog/931240/201806/931240-20180621223538266-738609387.png",Url:"https://www.cnblogs.com/aSnow/p/9211251.html"},
                                    {Title:"js自定义滚动条",Description:"js自定义滚动条",PicUrl:"https://images2018.cnblogs.com/blog/931240/201805/931240-20180516123950897-1314460530.png",Url:"https://www.cnblogs.com/aSnow/p/9045388.html"},
                                    {Title:"js流星雨效果",Description:"js流星雨效果",PicUrl:"https://images2018.cnblogs.com/blog/931240/201804/931240-20180423165917355-1864550567.png",Url:"https://www.cnblogs.com/aSnow/p/8920238.html"}
                                ];
                               //回复图文消息
                               res.send(msg.graphicMsg(fromUser,toUser,contentArr));
                            break;
                     }
                   }else{
                         //判断消息类型为 文本消息
                       if(result.MsgType.toLowerCase() === "text"){
                           //根据消息内容返回消息信息
                           switch(result.Content){
                               case '1':
                                        resultXml = msg.txtMsg(fromUser,toUser,'Hello ！你好啊！');
                                        res.send(resultXml);
                                    break;
                               case '2':
                                        resultXml = msg.txtMsg(fromUser,toUser,'你输入2');
                                        res.send(resultXml);
                                    break;
                               case '文章':
                                       var contentArr = [
                                    {Title:"css不定高图文垂直居中的三种方法",Description:"css不定高图文垂直居中的三种方法",PicUrl:"https://images2018.cnblogs.com/blog/931240/201806/931240-20180621223538266-738609387.png",Url:"https://www.cnblogs.com/aSnow/p/9211251.html"},
                                    {Title:"js自定义滚动条",Description:"js自定义滚动条",PicUrl:"https://images2018.cnblogs.com/blog/931240/201805/931240-20180516123950897-1314460530.png",Url:"https://www.cnblogs.com/aSnow/p/9045388.html"},
                                    {Title:"js流星雨效果",Description:"js流星雨效果",PicUrl:"https://images2018.cnblogs.com/blog/931240/201804/931240-20180423165917355-1864550567.png",Url:"https://www.cnblogs.com/aSnow/p/8920238.html"}
                                ];
                                        //回复图文消息
                                        res.send(msg.graphicMsg(fromUser,toUser,contentArr));
                                    break;
                                     case '3':
                                        var urlPath = path.join(__dirname, "../material/timg.jpg");
                                        that.uploadFile(urlPath, "image").then(function(mdeia_id) {
                                            resultXml = msg.imgMsg(fromUser, toUser, mdeia_id);
                                            console.log(resultXml);
                                            res.send(resultXml);
                                        })
                                        break;
                                        case '4':
                            that.getUserInfomation(fromUser).then(function(city) {
                                if(city) {
                                    // 获取的城市名为中文，不能直接访问，得通过encode编码一下
                                    var url = encodeURI(util.format(that.weather, city));
                                    request(url,function(err, response, body) {
                                        console.log(JSON.parse(body).data.forecast);
                                        var obj =JSON.parse(body).data.forecast;
                                        // 拼接字符串
                                        var str = JSON.parse(body).city +'今天天气为:   ' + obj[0].high +obj[0].low +'天气情况:' +obj[0].type +'温馨提示:' + obj[0].notice;
                                        resultXml = msg.txtMsg(fromUser,toUser, str);
                                        res.send(resultXml);
                                    })    
                                }else {
                                    resultXml = msg.txtMsg(fromUser,toUser, "未获取到城市信息");
                                    res.send(resultXml);
                                }
                            })
                            break;

                                default :
                                         res.send(msg.txtMsg(fromUser,toUser,'没有这个选项哦'));
                                    break;
                           }
                       }
                   }
                   
                //打印解析结果

                console.log(result);
            }else{
                 //打印错误信息
                console.log(err);
            }
        })
    });
}

// 素材上传
WeChat.prototype.uploadFile = function(urlPath, type) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.getAccessToken().then(function(data){ 
            var form = { //构造表单
                media: fs.createReadStream(urlPath)
            }
            var url = util.format(that.apiURL.uploadFile,that.apiDomain,data,type);
            that.requestPost(url, form).then(function(result) {
                resolve(JSON.parse(result).media_id);
            })
        })
    })
}

// 封装一个get请求方法
WeChat.prototype.requestGet = function(url) {
    return new Promise (function(resolve, reject) {
        request(url, (error, response, body)=> {
            resolve(body);
        })
    })
}

// 封装一个post请求方法
WeChat.prototype.requestPost = function(url, data) {
    return new Promise (function(resolve, reject) {
        request.post({url: url, formData:data}, function(err, httpResponse, body){
            resolve(body);
        })
    })
}

// 获取用户信息
WeChat.prototype.getUserInfomation = function(openid) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.getAccessToken().then(function(data){ 
            var url = util.format(that.apiURL.username,that.apiDomain, data, openid);
            that.requestGet(url).then(function(result) {
                resolve(JSON.parse(result).city);
            })
        })
    })
}






module.exports = WeChat;