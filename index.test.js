/* globals describe, beforeAll, it, expect */
const R = require('ramda');
const moment = require('moment');

const Plugin = require('./index');
const { name: pluginNameParam } = require('./package.json');

const pluginName = pluginNameParam.replace(/@(.+)\//g, '');

const app = new Plugin(R.pickBy(
  (_val, key) => key.substring(0, pluginName.length) === pluginName,
  process.env,
));

describe('search tests', () => {
  // let validKey = process;
  let hotels;
  let quotes;
  const token = {
    apiKey: app.apiKey,
    endpoint: app.endpoint,
    client: app.client, // TODO: ask what this is
  };
  const dateFormat = 'DD/MM/YYYY';
  beforeAll(async () => {
    // nada
  });
  describe('hotel booking process', () => {
    it('search for all available hotels, test hotel should exist', async () => {
      const retVal = await app.searchHotels({
        payload: {
          access: '0',
        },
        token,
      });
      expect(retVal).toBeTruthy();
      ({ hotels } = retVal);
      expect(hotels.length).toBeGreaterThan(0);
      expect(hotels.find((e) => /test/gi.test(e.hotelName))).toBeTruthy();
    });
    it('should be able to quote for test hotel 1 and 2', async () => {
      const retVal = await app.quoteHotel({
        token,
        payload: {
          travelDateStart: moment().add(1, 'M').format(dateFormat),
          travelDateEnd: moment().add(1, 'M').add(7, 'd').format(dateFormat),
          dateFormat,
          hotels: ['1', '2'],
          occupancies: [{ paxes: [{ age: 30 }, { age: 40 }] }],
          supplierId: 'HOTELTEST',
          currency: 'EUR',
          market: 'ES',
          language: 'es',
          nationality: 'ES',
          client: 'client_demo', // TODO: ask what this is for ?
          testMode: true,
          access: '0', // TODO: ask what this is for ?
        },
      });
      expect(retVal).toBeTruthy();
      ({ quotes } = retVal);
      expect(quotes.length).toBeGreaterThan(0);
      expect(quotes.find((e) => e.rooms.find((r) => /double room/gi.test(r.description)))).toBeTruthy();
    });
  });
  describe('existing bookings search', () => {
    it('should be search bookings by purchase date', async () => {
      const payload = {
        purchaseDateStart: '06/03/2020',
        purchaseDateEnd: '07/03/2020',
        dateFormat: 'DD/MM/YYYY',
        supplierId: 'HOTELTEST',
        access: '0', // TODO: ask what this is ?
        language: 'es',
        client: 'client_demo', // TODO: ask what this is ?
      };
      const retVal = await app.searchHotelBooking({
        payload,
        token,
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      expect(retVal.bookings.length).toBeGreaterThan(0);
      expect(retVal.bookings.filter(
        (e) => moment(e.bookingDate, 'YYYY-MM-DD').isBefore(moment(payload.purchaseDateStart, payload.dateFormat))
        || moment(e.bookingDate, 'YYYY-MM-DD').isAfter(moment(payload.purchaseDateEnd, payload.dateFormat)),
      ).length).toBe(0);
    });
    it('should be search bookings by travel date', async () => {
      const payload = {
        travelDateStart: '09/03/2020',
        travelDateEnd: '10/03/2020',
        dateFormat: 'DD/MM/YYYY',
        supplierId: 'HOTELTEST',
        access: '0', // TODO: ask what this is ?
        language: 'es',
      };
      const retVal = await app.searchHotelBooking({
        payload,
        token,
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      expect(retVal.bookings.length).toBeGreaterThan(0);
      expect(retVal.bookings.filter(
        (e) => moment(e.start, 'YYYY-MM-DD').isBefore(moment(payload.travelDateStart, payload.dateFormat))
        || moment(e.start, 'YYYY-MM-DD').isAfter(moment(payload.travelDateEnd, payload.dateFormat)),
      ).length).toBe(0);
    });
    it('should be able to search by booking Id', async () => {
      const retVal = await app.searchHotelBooking({
        payload: {
          bookingId: '988671',
          hotelCode: '1', // required for booking search
          currency: 'USD', // required for booking search
          supplierId: 'HOTELTEST',
          access: '0', // TODO: ask what this is ?
          language: 'es',
        },
        token,
      });
      // console.log(retVal.bookings[0]);
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      expect(retVal.bookings.length).toBeGreaterThan(0);
    });
  });
});
