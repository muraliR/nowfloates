var request = require('request');
var cheerio = require('cheerio');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var autoIncrement = require('mongoose-auto-increment');
var uniqueValidator = require('mongoose-unique-validator');
var sleep = require('sleep');
var kue = require('kue');
var queue = kue.createQueue();
var cron = require('cron');

var fetch = require('node-fetch');
var WAE = require('web-auto-extractor').default;
var pretty = require('js-object-pretty-print').pretty;


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
	completed: { type: Boolean },
	current_running_page: {type: Number, default: 0},
    created_at: {type: Date, default: Date.now}
});

citySchema.plugin(autoIncrement.plugin, { model: 'cities', field: 'city_id', startAt: 1 });
var City = mongoose.model('cities',citySchema);
citySchema.plugin(uniqueValidator);


var businessSchema = new Schema({
	name: { type: String, required: true},
	category: { type: String},
	website: { type: String, required: true},
	phone: { type: String, required: true, unique: true },
	city: { type: String, required: true },
    created_at: {type: Date, default: Date.now},
    contact_details: {type: Schema.Types.Mixed},
    contact_details_added: Boolean,
    schemaExists: Boolean,
    schemaData: {type: Schema.Types.Mixed}
});

businessSchema.plugin(autoIncrement.plugin, { model: 'business', field: 'business_id', startAt: 1 });
var Business = mongoose.model('business',businessSchema);
businessSchema.plugin(uniqueValidator);


var businessManagerSchema = new Schema({
    object_id : Number,
    created_at: {type: Date, default: Date.now}
});
var BusinessManager = mongoose.model('business_manager',businessManagerSchema);

//Create First Entry
BusinessManager.findOne({},function(err,pollData){
	if(pollData == null){
		var newPoll = new BusinessManager({ object_id: 0 });
		newPoll.save(function(err){
			if(!err){
				console.log('BusinessManager Started!!');		
			}
		});		
	}
});


var cronRunner = "*/15 * * * * *";

var cronJob = cron.job(cronRunner, function(){
	console.log(new Date());
	processBusiness();
	/*BusinessManager.findOne({}, function(err, pollData){

		var object_id = pollData.object_id;

		console.log(object_id);

		Business.findOne({business_id: {$gt: object_id}}).sort({business_id: 1}).exec(function(catErr, businessObj){
			if(businessObj == null){
			} else {
				
				BusinessManager.update({ object_id: object_id }, { $set: {object_id: businessObj.business_id} }, function(err, updatedResponse){
					fetchSchema(businessObj);
				}); 
			}
			
		})	
	});*/
});
cronJob.start();

/*Business.findOne({},function(catErr, businessObj){
	fetchSchema(businessObj);
})*/


function processBusiness(){
	Business.findOne({contact_details_added:{'$ne': true }}).limit(1).exec(function(err, business){
        if(business != null){
        	fetchSchema(business);
        } else {
        	console.log('************ Done ********************8')
        }
    });
}


function fetchSchema(business){

	//'http://narayaniheights.in'


	console.log('-------- Requesting ---' + business.website + ' ---------------');

	request(business.website, function (error, response, body) {
	    if (!error && response.statusCode == 200) {
	    	var parsed = WAE().parse(body);
			isMicroDataEmpty = Object.keys(parsed.microdata).length == 0;
			if(!isMicroDataEmpty){

				//console.log(pretty(parsed.microdata.LocalBusiness[0]));

				var localBusinessData = parsed.microdata.LocalBusiness[0];

				if(localBusinessData != undefined){

					var name = localBusinessData.name;
					var description = localBusinessData.description;

					var geo = getGeo(localBusinessData);
					var emails = getEmails(localBusinessData);
					var address = getAddress(localBusinessData);
					var telephone = getTelephone(localBusinessData)

					contact_details = {
						name: name,
						description: description,
						geo: geo,
						emails: emails,
						address: address,
						telephone: telephone
					}

					console.log(contact_details);

					var updateData = {contact_details : contact_details, contact_details_added : true, schemaData: localBusinessData, schemaExists: true}

					Business.update({ business_id: business.business_id }, { $set: updateData }, function(err, updatedResponse){
						console.log('------- Updated ------------' + business.business_id);
					}); 
				}
			} else {
				console.log('++ Schema Not Exists ++');
				var updateData = {contact_details_added : true, schemaExists: false}

				Business.update({ business_id: business.business_id }, { $set: updateData }, function(err, updatedResponse){
					console.log('------- Updated ------------' + business.business_id);
				}); 
			}
	    } else {
	    	console.log('++ Webiste not Working ++');
			var updateData = {contact_details_added : true, schemaExists: false}

			Business.update({ business_id: business.business_id }, { $set: updateData }, function(err, updatedResponse){
				console.log('------- Updated ------------' + business.business_id);
			}); 
	    }
	});


	/*fetch(business.website).then(function (res) {
		console.log(res.text());
		return res.text();
	}).then(function (body) {
		var parsed = WAE().parse(body);
		console.log('{}');
		isMicroDataEmpty = Object.keys(parsed.microdata).length == 0;
		if(!isMicroDataEmpty){
			console.log(pretty(parsed.microdata.LocalBusiness[0]));
		} else {
			console.log('++');
		}
	});*/
}


		

function getEmails(localBusinessData){
	var return_emails = [];
	var emailData = localBusinessData.email;
	if(emailData != undefined){
		if(emailData.constructor === Array){
			emailData.forEach(function(email){
				if(email.length != 0){
					var splitted = email.split('mailto:');

					if(splitted.length > 1){
						pushEmail = splitted[1];
					} else {
						pushEmail = splitted;
					}
					return_emails.push(pushEmail);
				}
			})
		} else {
			if(emailData.length != 0){
				var splitted = emailData.split('mailto:');

				if(splitted.length > 1){
					pushEmail = splitted[1];
				} else {
					pushEmail = splitted;
				}
				return_emails.push(pushEmail);
			}
		}
		return_emails = Array.from(new Set(return_emails));
	}
	return return_emails;
}

function getAddress(localBusinessData){
	var return_address = [];
	var addressData = localBusinessData.address;
	if(addressData != undefined){
		if(addressData.constructor === Array){
			addressData.forEach(function(addressObj){
				addressObj = deleteOtherKeys(addressObj);
				return_address.push(addressObj);
			})
		} else {
			addressObj = deleteOtherKeys(addressData);
			return_address.push(addressObj);
		}
	}
	return return_address;
}

function deleteOtherKeys(obj){
	delete obj['@context']; 
	delete obj['@type']; 
	return obj;
}

function getGeo(localBusinessData){
	var return_geo = [];
	var geoData = localBusinessData.geo;
	if(geoData != undefined){
		if(geoData.constructor === Array){
			geoData.forEach(function(geoObj){
				if(geoObj != ''){
					geoObj = deleteOtherKeys(geoObj);
					return_geo.push(geoObj);	
				}
				
			})
		} else {
			if(geoData != ''){
				geoObj = deleteOtherKeys(geoData);
				return_geo.push(geoObj);
			}
		}
	}
	return return_geo;
}

function getTelephone(localBusinessData){
	var return_telephone = [];
	var telephoneData = localBusinessData.telephone;
	if(telephoneData != undefined){
	    if(telephoneData.constructor === Array){
	        telephoneData.forEach(function(telephoneObj){
	            if(telephoneObj != ''){
	                telephoneObj = deleteOtherKeys(telephoneObj);
	                telephoneObj = processTelephone(telephoneObj);
	                return_telephone.push(telephoneObj);    
	            }
	            
	        })
	    } else {
	        if(telephoneData != ''){
	            telephoneObj = deleteOtherKeys(telephoneData);
	            telephoneObj = processTelephone(telephoneObj);
	            return_telephone.push(telephoneObj);
	        }
	    }
	}
	return_telephone = Array.from(new Set(return_telephone));
	return return_telephone;
}


function processTelephone(telephoneObj){
	if(telephoneObj.indexOf("tel:") > -1){
		telephoneObj = telephoneObj.replace("tel:", "");
		telephoneObj = telephoneObj.trim();
	}
	return telephoneObj;
}