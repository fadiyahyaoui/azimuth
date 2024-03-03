const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const parseString = require('xml2js').parseString;
const geolib = require('geolib');

const token = '6773169350:AAFMhb2bAWuwzUdxgW0bL4o2xUr4qowOCDU';  // Replace with your actual Telegram bot token
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running!');

const waitForCoordinates = {};

const keyboard = [
  [{ text: '/azimuth' }],
  [{ text: '/reset' }]
];

const replyOptions = { reply_markup: { keyboard, one_time_keyboard: true, resize_keyboard: true } };

// Function to display locations based on distance blocks
const displayLocations = (minDistance, maxDistance, kmlData, latitude, longitude) => {
  const filteredBlock = kmlData
    .filter(entry => entry.distance >= minDistance && entry.distance < maxDistance);

  const sortedBlock = filteredBlock.sort((a, b) => a.distance - b.distance);

  return sortedBlock;
};

// /reset command handler
bot.onText(/\/reset/, (msg) => {
  const chatId = msg.chat.id;
  delete waitForCoordinates[chatId];
  bot.sendMessage(chatId, 'Operation cancelled. Please choose an option:', replyOptions);
});

// /azimuth command handler
bot.onText(/\/azimuth/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Please enter the latitude:');
  waitForCoordinates[chatId] = { stage: 'latitude' };
});

// Callback query handler
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;

  if (callbackQuery.data === 'azimuth') {
    bot.sendMessage(chatId, 'Please enter the latitude:');
    waitForCoordinates[chatId] = { stage: 'latitude' };
  } else if (callbackQuery.data === 'reset') {
    delete waitForCoordinates[chatId];
    bot.sendMessage(chatId, 'Operation cancelled. Please choose an option:', replyOptions);
  }
});

// /start command handler
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome! Choose an option:', replyOptions);
});

// Text message handler
bot.on('text', (msg) => {
  const chatId = msg.chat.id;

  if (waitForCoordinates[chatId]) {
    const currentStage = waitForCoordinates[chatId].stage;

    if (currentStage === 'latitude') {
      waitForCoordinates[chatId].latitude = parseFloat(msg.text);
      bot.sendMessage(chatId, 'Please enter the longitude:');
      waitForCoordinates[chatId].stage = 'longitude';
    } else if (currentStage === 'longitude') {
      waitForCoordinates[chatId].longitude = parseFloat(msg.text);

      const latitude = waitForCoordinates[chatId].latitude;
      const longitude = waitForCoordinates[chatId].longitude;

      console.log(`Latitude: ${latitude}, Longitude: ${longitude}`);

      try {
        const xmlData = fs.readFileSync('doc.kml', 'utf-8');
        parseString(xmlData, { explicitArray: false }, (err, result) => {
  
          if (err) {
            console.error('Error parsing XML:', err);
            bot.sendMessage(chatId, 'Error parsing XML. Please try again.');
            return;
          }

          const kmlData = [];
          const processedLocations = new Set();

          result.kml.Document.Placemark.forEach(placemark => {
            if (placemark.ExtendedData && placemark.ExtendedData.SchemaData) {
              const schemaData = placemark.ExtendedData.SchemaData;
              const dataEntry = {};

              schemaData.SimpleData.forEach(simpleData => {
                dataEntry[simpleData.$.name] = simpleData._;
              });

              const locationKey = `${dataEntry.y}_${dataEntry.x}`;

              if (!processedLocations.has(locationKey)) {
                kmlData.push(dataEntry);
                processedLocations.add(locationKey);
              }
            }
          });

          kmlData.forEach(entry => {
            const kmlLatitude = parseFloat(entry.y);
            const kmlLongitude = parseFloat(entry.x);

            const distance = geolib.getDistance(
              { latitude, longitude },
              { latitude: kmlLatitude, longitude: kmlLongitude }
            );

            entry.distance = distance;
          });

          const blocks = [];
          blocks.push(displayLocations(0, 300, kmlData, latitude, longitude));
          blocks.push(displayLocations(300, 500, kmlData, latitude, longitude));
          blocks.push(displayLocations(500, 1000, kmlData, latitude, longitude));

          blocks.forEach(block => block.sort((a, b) => a.distance - b.distance));

          blocks.forEach(block => {
            block.forEach(entry => {
              const azimuth = geolib.getRhumbLineBearing(
                { latitude, longitude },
                { latitude: parseFloat(entry.y), longitude: parseFloat(entry.x) }
              );
              const roundedAzimuth = Math.round(azimuth);

              bot.sendMessage(chatId, `Secteur: ${entry.sector}\nPCI: ${entry.PCI}\n${entry.distance} meters\nAzimuth: ${roundedAzimuth}°`);
            });
          });


          delete waitForCoordinates[chatId];
        });
      } catch (error) {
        console.error('Error reading KML file:', error);
        bot.sendMessage(chatId, 'Error reading KML file. Please try again.');
      }
    }
  }
});