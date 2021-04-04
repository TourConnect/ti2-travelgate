const axios = require('axios');
const R = require('ramda');
const moment = require('moment');
require('util').inspect.defaultOptions.depth = null;

const { name: pluginNameParam } = require('./package.json');
const bookingQL = require('./graphQL/quote');
const searchQL = require('./graphQL/search');
const hotelSearchQL = require('./graphQL/hotelSearch');

const pluginName = pluginNameParam.replace(/@(.+)\//g, '');

const capitalize = (s) => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const doMap = (obj, map) => {
  const retVal = {};
  Object.entries(map).forEach(([attribute, fn]) => {
    const newVal = fn(obj);
    if (newVal !== undefined) {
      retVal[attribute] = newVal;
    }
  });
  return retVal;
};

const bookingMapOut = {
  id: R.path(['reference', 'bookingID']),
  status: (e) => capitalize(R.path(['status'], e)),
  holder: R.path(['holder']),
  telephone: R.path(['phone']),
  supplierId: R.path(['reference', 'supplier']),
  hotelId: R.path(['hotel', 'hotelCode']),
  hotelName: R.path(['hotel', 'hotelName']),
  rooms: (e) => e.hotel.rooms.map((r) => ({
    description: R.path(['description'], r),
    roomId: R.path(['code'], r), // code
    price: R.path(['price'], r),
  })),
  start: R.path(['hotel', 'start']),
  end: R.path(['hotel', 'end']),
  bookingDate: R.path(['hotel', 'bookingDate']),
  cancelPolicy: (e) => ({
    refundable: R.path(['cancelPolicy', 'refundable'], e),
    cancelPenalties: R.path(['cancelPolicy', 'refundable'], e),
  }),
};

const hotelsMapOut = {
  hotelId: R.path(['node', 'hotelData', 'hotelCode']),
  hotelName: R.path(['node', 'hotelData', 'hotelName']),
};

const quotesMapOut = {
  id: R.path(['id']),
  hotelName: R.path(['hotelName']),
  hotelId: R.path(['hotelCode']),
  supplierId: R.path(['supplierCode']),
  paymentType: R.path(['paymentType']),
  rooms: (e) => e.rooms.map((r) => ({
    description: R.path(['description'], r),
    roomId: R.path(['code'], r), // code
    price: R.path(['roomPrice', 'price'], r),
    beds: R.path(['beds']),
  })),
  price: R.path(['price']),
  surcharges: R.path(['surcharges']),
  cancelPolicy: R.path(['cancelPolicy']),
};

const getHeaders = (apiKey) => ({
  Authorization: `ApiKey ${apiKey}`,
  'Content-Type': 'application/json',
});
class Plugin {
  constructor(params) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      const nuName = attr.replace(`${pluginName}-`, '');
      this[nuName] = value;
    });
  }

  async searchHotelBooking({
    token: {
      apiKey,
      endpoint,
      client, // TODO: what is this ?
    },
    payload: payloadParam,
  }) {
    const payload = R.reject(R.equals(''))(R.map(
      (e) => e.toString().trim(),
      payloadParam,
    ));
    const dateFormat = payload.dateFormat || 'DD/MM/YYYY';
    let typeSearch = '';
    let dates = {};
    if (payload.bookingId) {
      typeSearch = 'REFERENCES';
    } else if (payload.purchaseDateStart) {
      typeSearch = 'DATES';
      const endDate = payload.purchaseDateEnd || payload.purchaseDateStart;
      dates = {
        dates: {
          dateType: 'BOOKING',
          start: moment(payload.purchaseDateStart, dateFormat).format('YYYY-MM-DD'),
          end: moment(endDate, dateFormat).format('YYYY-MM-DD'),
        },
      };
    } else if (payload.travelDateStart) {
      typeSearch = 'DATES';
      const endDate = payload.travelDateEnd || payload.travelDateStart;
      dates = {
        dates: {
          dateType: 'ARRIVAL',
          start: moment(payload.travelDateStart, dateFormat).format('YYYY-MM-DD'),
          end: moment(endDate, dateFormat).format('YYYY-MM-DD'),
        },
      };
    }
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const data = JSON.stringify({
      query: searchQL(),
      variables: {
        criteria: {
          accessCode: payload.access,
          language: payload.language,
          ...(payload.bookingId ? {
            references: {
              references: [{
                supplier: payload.bookingId,
              }],
              hotelCode: payload.hotelCode,
              currency: payload.currency,
            },
          } : {}),
          typeSearch,
          ...dates,
        },
        settings: {
          client,
          auditTransactions: true,
          context: payload.supplierId,
          testMode: true,
          timeout: 18000,
        },
      },
    });
    const results = await axios({
      method: 'post',
      url,
      headers,
      data,
    });
    // console.log(results.data);
    // return doMap(JSON.parse(profile).companyProfile, mapIn);
    const bookingResult = R.path(['data', 'data', 'hotelX', 'booking'], results);
    if (bookingResult.errors) {
      throw new Error(bookingResult.error);
    }
    // console.log(bookingResult.bookings[0]);
    if (payload.purchaseDateStart && payload.purchaseDateEnd) {
      // TODO: secondary filtering
    }
    return { bookings: bookingResult.bookings.map((e) => doMap(e, bookingMapOut)) };
  }

  async searchHotels({ token: { apiKey, endpoint }, payload }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const data = JSON.stringify({
      query: hotelSearchQL(),
      variables: {
        criteria: {
          access: payload.access,
        },
        relay: {},
      },
    });
    const results = await axios({
      method: 'post',
      url,
      headers,
      data,
    });
    const hotelsResult = R.path(['data', 'data', 'hotelX', 'hotels'], results);
    if (hotelsResult.errors) {
      throw new Error(hotelsResult.error);
    }
    return { hotels: hotelsResult.edges.map((e) => doMap(e, hotelsMapOut)) };
  }

  async quoteHotel({ token: { apiKey, endpoint }, payload }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const { dateFormat = 'DD/MM/YYYY' } = payload;
    const checkIn = moment(payload.travelDateStart, dateFormat).format('YYYY-MM-DD');
    const checkOut = moment(payload.travelDateEnd, dateFormat).format('YYYY-MM-DD');
    const data = JSON.stringify({
      query: bookingQL(),
      variables: {
        criteria: {
          checkIn,
          checkOut,
          ...R.omit([
            'travelDateEnd',
            'travelDateStart',
            'dateFormat',
            'supplierId',
            'client',
            'testMode',
            'access',
          ], payload),
        },
        settings: {
          client: payload.client,
          context: payload.supplierId,
          auditTransactions: false,
          testMode: payload.testMode,
          timeout: 25000,
        },
        filter: { access: { includes: [payload.access] } },
      },
    });
    const results = await axios({
      method: 'post',
      url,
      headers,
      data,
    });
    const options = R.path(['data', 'data', 'hotelX', 'search', 'options'], results);
    return { quotes: options.map((e) => doMap(e, quotesMapOut)) };
  }

  async cancelBooking({ token: { apiKey, endpoint, client } }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const data = JSON.stringify({ query: bookingSearch({ client }) });
    // TODO : how to cancel ~!
    const results = await axios({
      method: 'post',
      url,
      headers,
      data,
    });
    const bookingResult = R.path(['data', 'data', 'hotelX', 'booking'], results);
    if (bookingResult.errors) throw new Error(bookingResult.error);
    // console.log(bookingResult.bookings[0]);
    return { bookings: bookingResult.bookings.map((e) => doMap(e, bookingMapOut)) };
  }
}

module.exports = Plugin;
