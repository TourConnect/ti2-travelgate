const R = require('ramda');
const moment = require('moment');
const assert = require('assert');
require('util').inspect.defaultOptions.depth = null;

const quoteQL = require('./graphQL/quote');
const searchAvailabilityQL = require('./graphQL/availability');
const searchQL = require('./graphQL/search');
const hotelSearchQL = require('./graphQL/hotelSearch');
const bookQL = require('./graphQL/book');
const cancelQL = require('./graphQL/cancel');

const capitalize = (s) => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const checkError = payload => {
  const errorObj = R.path(
    ['errors', 0],
    payload,
  );
  if (errorObj) {
    throw new Error(
      errorObj.description, {
        cause: {
          code: errorObj.code,
          values: [
            errorObj.type,
          ],
        },
      },
    );
  }
  if (errorObj.error) {
    throw new Error(errorObj.error);
  }
  return undefined;
  // return new Error(JSON.stringify(payload));
};

const dateSort = (a, b) => moment(a.start, 'YYYY-MM-DD').unix()
  - moment(b.start, 'YYYY-MM-DD').unix();

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
  supplierBookingId: R.path(['reference', 'supplier']),
  hotelId: R.path(['hotel', 'hotelCode']),
  hotelName: R.path(['hotel', 'hotelName']),
  rooms: (e) => e.hotel.rooms.map((r) => ({
    roomId: R.path(['code'], r), // code
    description: R.path(['description'], r),
    price: R.path(['price'], r),
  })),
  start: R.path(['hotel', 'start']),
  end: R.path(['hotel', 'end']),
  bookingDate: R.path(['hotel', 'bookingDate']),
  price: R.path(['price']),
  cancelPolicy: (e) => ({
    refundable: R.path(['cancelPolicy', 'refundable'], e),
    cancelPenalties: R.path(['cancelPolicy', 'cancelPenalties'], e),
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
  supplierBookingId: R.path(['supplierCode']),
  paymentType: R.path(['paymentType']),
  rooms: (e) => e.rooms.map((r) => doMap(r, {
    description: R.path(['description']),
    roomId: R.path(['code']), // code
    price: R.path(['roomPrice', 'price']),
    beds: R.path(['beds']),
  })),
  pricing: (el) => doMap(el, {
    retail: R.path(['price', 'gross']),
    net: R.path(['price', 'net']),
    currency: R.path(['price', 'currency']),
    includedTaxes: (e) => (e.surcharges || []).map((c) => doMap(c, {
      name: R.path(['description']),
      net: R.path(['price']),
      ...R.omit(['description', 'price']),
    })),
  }),
  surcharges: R.path(['surcharges']),
  cancelPolicy: R.path(['cancelPolicy']),
};

const getHeaders = ({ apiKey, requestId }) => ({
  Authorization: `ApiKey ${apiKey}`,
  'Content-Type': 'application/json',
  ...requestId ? { requestId } : {},
});

class Plugin {
  constructor(params = {}) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
    this.tokenTemplate = () => ({
      clientCode: {
        type: 'text',
        regExp: /^\w+$/,
        description: 'The Ti2 host app making the connection',
        default: 'tourconnect',
      },
      apiKey: {
        type: 'text',
        regExp: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
        description: 'the User Key provided by TravelGate to identify the user',
      },
      endpoint: {
        type: 'text',
        regExp: /^(?!mailto:)(?:(?:http|https|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?:(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[0-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))|localhost)(?::\d{2,5})?(?:(\/|\?|#)[^\s]*)?$/i,
        default: 'https://api.travelgatex.com',
        description: 'The url api endpoint from travelgate',
      },
    });
  }

  async validateToken({
    axios,
    token: {
      apiKey,
      // clientCode,
      endpoint,
    },
    requestId,
  }) {
    try {
      const url = `${endpoint || this.endpoint}/`;
      const headers = getHeaders({ apiKey: apiKey || this.apiKey, requestId });
      const data = JSON.stringify({
        query: hotelSearchQL(),
        variables: {
          criteria: {
            access: 0,
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
      assert(Array.isArray(hotelsResult.edges));
      checkError(hotelsResult);
      return true;
    } catch (err) {
      return false;
    }
  }

  async searchBooking({
    axios,
    token: {
      apiKey,
      endpoint,
      clientCode,
    },
    payload: payloadParam,
    requestId,
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
    const headers = getHeaders({ apiKey: apiKey || this.apiKey, requestId });
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

    checkError(bookingResult);
    if (payload.purchaseDateStart && payload.purchaseDateEnd) {
      // TODO: secondary filtering
    }
    return {
      bookings: R.sort(
        dateSort,
        (bookingResult.bookings || []).map(
          (e) => doMap(e, bookingMapOut),
        ),
      ),
    };
  }

  async searchProducts({ axios, token: { apiKey, endpoint }, payload, requestId }) {
    // TODO: implement a productName match
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders({ apiKey: apiKey || this.apiKey, requestId });
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
    checkError(hotelsResult);
    return { accommodation: hotelsResult.edges.map((e) => doMap(e, hotelsMapOut)) };
  }

  async searchAvailability({ axios, token: { apiKey, endpoint, clientCode }, payload, requestId }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders({ apiKey: apiKey || this.apiKey, requestId });
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
    const options = R.pathOr([], ['data', 'data', 'hotelX', 'search', 'options'], results);
    const availability = options.map((e) => doMap(e, availabilityMapOut));
    return { availability };
  }

  async searchQuote({ axios, token: { apiKey, endpoint, clientCode }, payload, requestId }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders({ apiKey: apiKey || this.apiKey, requestId });
    const availabilityId = payload.id;
    const data = JSON.stringify({
      query: quoteQL(),
      variables: {
        criteria: {
          optionRefId: availabilityId,
        },
        settings: {
          client: clientCode,
          auditTransactions: false,
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
    checkError(quote);
    return {
      quote: {
        ...quote.optionQuote,
        id: quote.optionQuote.optionRefId,
      },
    };
  }

  async createBooking({
    axios,
    token: { apiKey, endpoint, clientCode },
    payload,
    requestId,
  }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders({ apiKey: apiKey || this.apiKey, requestId });
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
    checkError(book);
    return ({ booking: book.booking });
  }

  async cancelBooking({
    axios,
    token: { apiKey, endpoint, clientCode },
    payload,
    requestId,
  }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders({ apiKey: apiKey || this.apiKey, requestId });
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
    checkError(cancelResult);
    return { cancellation: cancelResult.cancellation };
  }
}

module.exports = Plugin;
