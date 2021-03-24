/* globals describe, beforeAll, it, expect */
const R = require('ramda');
const Plugin = require('./index');
const { name: pluginName } = require('./package.json');

const app = new Plugin(R.pickBy(
  (_val, key) => key.substring(0, pluginName.length) === pluginName,
  process.env,
));

describe('saerch tests', () => {
  // let validKey = process;
  beforeAll(async () => {
    // nada
  });
  it(' should be able to search by booking Id', async () => {
    const retVal = await app.searchHotelBooking({
      payload: {
        bookingId: '200127',
      },
      token: {
        apiKey: app.apiKey,
        endpoint: app.endpoint,
        client: app.client,
      },
    });
    console.log(retVal.bookings[0]);
    expect(retVal).toBeTruthy();
  });
});
