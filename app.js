var express = require('express');
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var app = express();
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var autoIncrement = require('mongoose-auto-increment');
var uniqueValidator = require('mongoose-unique-validator');
var sleep = require('sleep');
var kue = require('kue');
var queue = kue.createQueue();
var cron = require('cron');


var mongoose_connection = mongoose.connect('mongodb://localhost:27017/nowfloats');
autoIncrement.initialize(mongoose_connection);


var countrySchema = new Schema({
	name: { type: String, required: true, unique: true},
	url: { type: String, required: true, unique: true },
    created_at: {type: Date, default: Date.now}
});

countrySchema.plugin(autoIncrement.plugin, { model: 'countries', field: 'country_id', startAt: 1 });
var Country = mongoose.model('countries',countrySchema);
countrySchema.plugin(uniqueValidator);

var citySchema = new Schema({
	name: { type: String, required: true, unique: true},
	url: { type: String, required: true, unique: true },
	country: { type: String, required: true },
	pages: { type: Number },
    created_at: {type: Date, default: Date.now}
});

citySchema.plugin(autoIncrement.plugin, { model: 'cities', field: 'city_id', startAt: 1 });
var City = mongoose.model('cities',citySchema);
citySchema.plugin(uniqueValidator);



var pollManagerSchema = new Schema({
    object_id : Number,
    object_type : String,
    created_at: {type: Date, default: Date.now}
});
var PollManager = mongoose.model('poll_manager',pollManagerSchema);

//Create First Entry
PollManager.findOne({},function(err,pollData){
	if(pollData == null){
		var newPoll = new PollManager({ object_type: 'cities', object_id: 0 });
		newPoll.save(function(err){
			if(!err){
				console.log('PollManager Started!!');		
			}
		});		
	}
})


function scrapeCountries(){
	var countries = [];
	request('https://shops.nowfloats.com/', function (error, response, html) {
	    if (!error && response.statusCode == 200) {
	        var $ = cheerio.load(html);
	        $('li.country-heading').each(function(i,elem) {
	        	var country_name = $(this).text().trim()
	        	var country_url = 'https://shops.nowfloats.com' + $(this).find('a').attr('href');
	        	var newCountry = new Country({ name: country_name, url: country_url });
				newCountry.save(function(err){
					if(!err){
						console.log('Saved!');		
					} else {
						console.log(err);
					}
				});		
	        });
	    } else {
	    	console.log('dasdasdas ----');
	    }
	});	
}

function scrapeCities(country){
	request('https://shops.nowfloats.com/', function (error, response, html) {
	    if (!error && response.statusCode == 200) {
	        var $ = cheerio.load(html);

	        var stop = false;
			$( "a:contains('"+country.name+"')").parent('li').nextAll('li').each(function(i,elem){  
				if(stop == false){
					if( $(this).attr('class') == "blank-space"){
						stop = true;
					} else {
						var city_name = $(this).text();
						city_name = city_name.split('(')[0].trim();

						var city_url = 'https://shops.nowfloats.com' + $(this).find('a').attr('href');

						console.log(country.name + '*****' + city_name + '***' + city_url);

			        	var newCity = new City({ name: city_name, url: city_url, country: country.name });
						newCity.save(function(err){
							if(!err){
								console.log('Saved!');		
							} else {
								console.log(err);
							}
						});		
					}
				}
			});


			/*$($('.country-stores')[3]).find('li').each(function(i,elem){ 
				var city_name = $(this).text();
				city_name = city_name.split('(')[0].trim();
				

				var city_url = 'https://shops.nowfloats.com' + $(this).find('a').attr('href');

				console.log(city_name + '***' + city_url);
			});*/
		}
	});
}

function processCards(){
	request('https://shops.nowfloats.com/India/Stores-in-Durgapur/', function (error, response, html) {
	    if (!error && response.statusCode == 200) {
	        var $ = cheerio.load(html);

	        var pages = 1;

	        if($('.pagination-text').length != 0){
	        	page_text = $($('.pagination-text').next('span')[0]).text();
	        	page_text = page_text.split('of ')[1];
	        	pages = parseInt(page_text);
	        }

	        pages = [...Array(pages).keys()];


	        scrapeCards(pages,'https://shops.nowfloats.com/India/Stores-in-Durgapur/');


	        /*pages.forEach(function(page){
	        	page = page + 1;

	        	$('.store').each(function(i,elem){

	        		var category = '';
	        		var phone = '';

	        		var business_name = $($(this).find('h3')[0]).text();
	        		var category = $($(this).find('img[alt="category-icon"]')[0]).next('span').text()

	        		if(category != undefined && category != null){
	        			category = category.trim();
	        		}

	        		var phone = $(this).find('.telephone').text();

	        		phone = phone.trim();

	        		website_url = $(this).find('.contact-stores a').attr('href');

	        		console.log(business_name + '  ' + category + ' ' + phone + website_url);


	        	})

	        })*/
	    }
	});
}

function scrapeCards(pages,url){
	pages.forEach(function(page){
	    page = page + 1;	

	    page_url = url + '?page=' + page;

	    console.log(page_url);

	    /*request(, function (error, response, html) {
	    }*/
	});
}


function updatePages(cityObj){
	console.log('++++++++++++++++++++++++++++++++++++++++')
	console.log(cityObj.city_id);
	console.log(cityObj.url);
	request(cityObj.url, function (error, response, html) {
		if (!error && response.statusCode == 200) {
    		var $ = cheerio.load(html);

    		var pages = 1;

    		if($('.pagination-text').length != 0){
	        	page_text = $($('.pagination-text').next('span')[0]).text();
	        	page_text = page_text.split('of ')[1];
	        	pages = parseInt(page_text);
	        }

	        City.update({ city_id: cityObj.city_id }, { $set: {pages: pages} }, function(err, updatedResponse){ 
				if(err) {
					console.log(err);
				} else {
					console.log(updatedResponse);
					console.log(pages);
				}
			});

	    }
	});
}



/*Country.findOne({name: 'INDIA'},function(err,cityObj){
	scrapeCities(cityObj);
})*/

//updatePages();


app.listen('8081');
console.log('server started');


var cronRunner = "*/5 * * * * *";	
var cronJob = cron.job(cronRunner, function(){
	console.log(new Date());
	PollManager.findOne({}, function(err, pollData){
		var object_id = pollData.object_id;
		City.findOne({city_id: {$gt: object_id}}).sort({city_id: 1}).exec(function(cityErr, cityObj){
			if(cityObj != null){
				updatePages(cityObj);
				PollManager.update({ object_id: object_id }, { $set: {object_id: cityObj.city_id} }, function(err, updatedResponse){
				}); 
			} else {
				console.log('null');
				console.log({city_id: {$gt: object_id}});
			}
			
		})	
	});
});
cronJob.start();

/*Country.find({name: {'$ne': 'INDIA' }},function(err,country){
	console.log(country);
	scrapeCities(country);
});*/


// var cronRunner = "*/5 * * * * *";	
// var cronJob = cron.job(cronRunner, function(){
// 	console.log(new Date());
// 	PollManager.findOne({}, function(err, pollData){
// 		var object_id = pollData.object_id;
// 		Country.findOne({country_id: {$gt: object_id},name: {'$ne': 'INDIA' }}).sort({country_id: 1}).exec(function(cityErr, country){
// 			if(country != null){
// 				scrapeCities(country);
// 				PollManager.update({ object_id: object_id }, { $set: {object_id: country.country_id} }, function(err, updatedResponse){
// 				}); 
// 			} else {
// 				console.log('******************');
// 			}
			
// 		})	
// 	});
// });
// cronJob.start();




exports = module.exports = app;
