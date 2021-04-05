const axios = require('axios');
const R = require('ramda');
const moment = require('moment');
require('util').inspect.defaultOptions.depth = null;

const { name: pluginNameParam } = require('./package.json');
const quoteQL = require('./graphQL/quote');
const searchAvailabilityQL = require('./graphQL/availability');
const searchQL = require('./graphQL/search');
const hotelSearchQL = require('./graphQL/hotelSearch');
const bookQL = require('./graphQL/book');
const cancelQL = require('./graphQL/cancel');

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

const availabilityMapOut = {
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
      const nuName = attr.replace(new RegExp(`${pluginName}[-_]`), '');
      this[nuName] = value;
    });
  }

  async searchHotelBooking({
    token: {
      apiKey,
      endpoint,
      clientCode,
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
          client: clientCode,
          auditTransactions: true,
          context: payload.context,
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
    // return doMap(JSON.parse(profile).companyProfile, mapIn);
    const bookingResult = R.path(['data', 'data', 'hotelX', 'booking'], results);
    if (bookingResult.errors) {
      throw new Error(bookingResult.error);
    }
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

  async searchAvailability({ token: { apiKey, endpoint, clientCode }, payload }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const { dateFormat } = payload;
    const checkIn = moment(payload.travelDateStart, dateFormat).format('YYYY-MM-DD');
    const checkOut = moment(payload.travelDateEnd, dateFormat).format('YYYY-MM-DD');
    const data = {
      query: searchAvailabilityQL(),
      variables: {
        criteria: {
          checkIn,
          checkOut,
          ...R.pick([
            'hotels',
            'occupancies',
            'currency',
            'market',
            'language',
            'nationality',
          ], payload),
        },
        settings: {
          client: clientCode,
          ...R.pick(['context', 'testMode'], payload),
          auditTransactions: false,
          timeout: 25000,
        },
        filter: { access: { includes: [payload.access] } },
      },
    };
    const results = await axios({
      method: 'post',
      url,
      headers,
      data: JSON.stringify(data),
    });
    const options = R.path(['data', 'data', 'hotelX', 'search', 'options'], results);
    return { availability: options.map((e) => doMap(e, availabilityMapOut)) };
  }

  async quoteAvailability({ token: { apiKey, endpoint, clientCode }, payload }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const optionRefId = payload.id;
    const data = JSON.stringify({
      query: quoteQL(),
      variables: {
        criteria: {
          optionRefId,
        },
        settings: {
          client: clientCode,
          auditTransactions: true,
          ...R.pick(['context', 'testMode'], payload),
          timeout: 5000,
        },
      },
    });
    const results = await axios({
      method: 'post',
      url,
      headers,
      data,
    });
    const quote = R.path(['data', 'data', 'hotelX', 'quote'], results);
    if (quote.errors.length > 0) {
      console.error(quote.errors);
      throw new Error(quote.errors[0].description);
    }
    return { quote: quote.optionQuote };
  }

  async book({ token: { apiKey, endpoint, clientCode }, payload }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const data = {
      query: bookQL(),
      variables: {
        input: {
          optionRefId: payload.id,
          ...R.pick([
            'clientReference',
            'deltaPrice',
            'holder',
            'remarks',
            'paymentCard',
            'rooms',
          ], payload),
        },
        settings: {
          client: clientCode,
          auditTransactions: false,
          useContext: true,
          ...R.pick(['context', 'testMode'], payload),
        },
      },
    };
    const results = await axios({
      method: 'post',
      url,
      headers,
      data: JSON.stringify(data),
    });
    const book = R.path(['data', 'data', 'hotelX', 'book'], results);
    if (book.errors.length > 0) {
      console.error(book.errors);
      throw new Error(book.errors[0].description);
    }
    return ({ booking: book.booking });
  }

  async cancelBooking({ token: { apiKey, endpoint, clientCode }, payload }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const data = {
      query: cancelQL(),
      variables: {
        input: {
          bookingID: payload.id,
        },
        settings: {
          client: clientCode,
          auditTransactions: false,
          ...R.pick(['context', 'testMode'], payload),
          timeout: 18e3,
        },
      },
    };
    const results = await axios({
      method: 'post',
      url,
      headers,
      data: JSON.stringify(data),
    });
    const cancelResult = R.path(['data', 'data', 'hotelX', 'cancel'], results);
    if (cancelResult.errors) throw new Error(cancelResult.error);
    return { cancellation: cancelResult.cancellation };
  }
}

module.exports = Plugin;
