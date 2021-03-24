const axios = require('axios');
const R = require('ramda');
require('util').inspect.defaultOptions.depth = null;

const { name: pluginNameParam } = require('./package.json');

const pluginName = pluginNameParam.replace(/@(.+)\//g, '');

const capitalize = (s) => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const bookingSearch = ({ client }) => `
{
  hotelX {
    booking(
      criteria: {
        accessCode: "0"
        language: "es"
        typeSearch: DATES
        dates: { dateType: BOOKING, start: "2020-01-24", end: "2020-01-25" }
      }
      settings: {
        client: "${client}"
        auditTransactions: true
        context: "HOTELTEST"
        testMode: true
        timeout: 18000
      }
    ) {
      bookings {
        billingSupplierCode
        reference {
          client
          supplier
          hotel
          bookingID
        }
        holder {
          name
          surname
        }
        status
        hotel {
            start
            end
          hotelCode
          hotelName
          boardCode
          occupancies {
            id
            paxes {
              age
            }
          }
          rooms {
            occupancyRefId
            code
            description
            price {
              currency
              net
              exchange {
                currency
                rate
              }
            }
          }
        }
        cancelPolicy {
          refundable
          cancelPenalties {
            hoursBefore
            penaltyType
            currency
            value
          }
        }
        remarks
        payable
      }
      errors {
        code
        type
        description
      }
      warnings {
        code
        type
        description
      }
    }
  }
}

`;

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

  async searchHotelBooking({ token: { apiKey, endpoint, client } }) {
    const url = `${endpoint || this.endpoint}/`;
    const headers = getHeaders(apiKey || this.apiKey);
    const data = JSON.stringify({ query: bookingSearch({ client }) });
    const results = await axios({
      method: 'post',
      url,
      headers,
      data,
    });
    // console.log(results.data);
    // return doMap(JSON.parse(profile).companyProfile, mapIn);
    const bookingResult = R.path(['data', 'data', 'hotelX', 'booking'], results);
    if (bookingResult.errors) throw new Error(bookingResult.error);
    // console.log(bookingResult.bookings[0]);
    return { bookings: bookingResult.bookings.map((e) => doMap(e, bookingMapOut)) };
  }
}

module.exports = Plugin;
