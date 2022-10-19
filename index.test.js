/* globals describe, beforeAll, it, expect */
const R = require('ramda');
const moment = require('moment');
const faker = require('faker');

const Plugin = require('./index');

const app = new Plugin();

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

describe('travel-gate', () => {
  // let validKey = process;
  let accommodation;
  let availability;
  let quoteId;
  let bookingId;
  const token = {
    apiKey: process.env.ti2_travelgate_apiKey,
    endpoint: process.env.ti2_travelgate_endpoint,
    clientCode: process.env.ti2_travelgate_clientCode,
    /*
     * A travel company that buys accommodation services
    * via Hotel-X API is considered a "client" in our architecture".
    * Client codes are consistent throughout all TravelgateX implementations.
    * These codes are used to identify the business that is making the request
    * and to confirm that the business has a configuration assigned to it.
    */
  };
  const defaultAccessCode = 0;
  /*
   * Accesses are displayed as numeric codes in Hotel-X and represent Supplier
   * configurations for a given credential. Those configurations include:
   * URLs
   * Credentials
   * Markets
   * Rate Types
   * Specific Supplier settings
   * An access is used by just a client exclusively.
   * The same supplier has different access depends on the number of clients
   * connected to him, even if the configuration is almost the same.
*/
  const dateFormat = 'DD/MM/YYYY';
  it('make sure the token is valid', () => {
    expect(token.apiKey).toBeTruthy();
    expect(token.endpoint).toBeTruthy();
    expect(token.clientCode).toBeTruthy();
  });
  describe('tooling tests', () => {
    describe('validateToken', () => {
      it('valid token', async () => {
        const retVal = await app.validateToken({
          token,
        });
        expect(retVal).toBeTruthy();
      });
      it('invalid token', async () => {
        const retVal = await app.validateToken({
          token: { ...token, apiKey: 'somerandom' },
        });
        expect(retVal).toBeFalsy();
      });
    });
  });
  describe('booking', () => {
    describe('hotel booking process', () => {
      it('search for all available hotels, test hotel should exist', async () => {
        const retVal = await app.searchProducts({
          payload: {
            access: defaultAccessCode,
          },
          token,
        });
        expect(retVal).toBeTruthy();
        ({ accommodation } = retVal);
        expect(accommodation.length).toBeGreaterThan(0);
        expect(accommodation.find((e) => /test/gi.test(e.hotelName))).toBeTruthy();
      });
      it('should be able to check availability for test hotel 1 and 2', async () => {
        const retVal = await app.searchAvailability({
          token,
          payload: {
            travelDateStart: moment().add(6, 'M').format(dateFormat),
            travelDateEnd: moment().add(6, 'M').add(7, 'd').format(dateFormat),
            dateFormat,
            hotels: ['1', '2'],
            occupancies: [{ paxes: [{ age: 30 }, { age: 40 }] }],
            context: 'HOTELTEST',
            currency: 'EUR',
            market: 'ES',
            language: 'es',
            nationality: 'ES',
            testMode: true,
            access: defaultAccessCode,
          },
        });
        expect(retVal).toBeTruthy();
        ({ availability } = retVal);
        expect(availability.length).toBeGreaterThan(0);
        expect(availability.find((e) => e.rooms.find((r) => /double standard/gi.test(r.description)))).toBeTruthy();
        availability = rnd(availability); // pick 1
      });
      it('should be able to quote for an availability result', async () => {
        const { id } = availability; // availability result id
        const retVal = await app.searchQuote({
          token,
          payload: {
            id,
            context: 'HOTELTEST',
            testMode: true,
          },
        });
        expect(retVal).toBeTruthy();
        quoteId = R.path(['quote', 'id'], retVal);
        // ({ quote: [{ id: quoteId }] } = retVal);
        expect(quoteId).toBeTruthy();
      });
      it('should be able to book a reservation of 1 room', async () => {
        const fullName = faker.name.findName().split(' ');
        const billName = faker.name.findName().split(' ');
        const expDate = moment().add(1, 'y');
        const paxes = [
          fullName,
          faker.name.findName().split(' '),
        ];
        const retVal = await app.createBooking({
          token,
          payload: {
            id: quoteId, // availability result id
            clientReference: faker.finance.account(),
            holder: { name: fullName[0], surname: fullName[1] },
            remarks: faker.lorem.sentence(),
            ...(availability.paymentType === 'DIRECT' ? {
              paymentCard: {
                cardType: rnd(['VI', 'MC']),
                holder: { name: billName[0], surname: billName[1] },
                number: '4242 4242 4242 4242',
                CVC: '914',
                expire: { month: expDate.month(), year: expDate.year() },
              },

            } : {}),
            rooms: {
              occupancyRefId: 1,
              paxes: [
                {
                  name: paxes[0][0],
                  surname: paxes[0][1],
                  age: faker.datatype.number({ min: 21, max: 60 }),
                },
                {
                  name: paxes[1][0],
                  surname: paxes[1][1],
                  age: faker.datatype.number({ min: 21, max: 60 }),
                },
              ],
            },
            context: 'HOTELTEST',
            testMode: true,
          },
        });
        expect(retVal).toBeTruthy();
        bookingId = R.path(['booking', 'reference', 'bookingID'], retVal);
        expect(bookingId).toBeTruthy();
      });
      it('sould be able to cancel the generated booking', async () => {
        const retVal = await app.cancelBooking({
          token,
          payload: {
            id: bookingId || '1[1|201228|201229|200226|1|es|EUR|0|TEST_LOCATOR_1|975723',
            context: 'HOTELTEST',
            testMode: true,
          },
        });
        expect(retVal).toBeTruthy();
        expect(R.path(['cancellation', 'status'], retVal)).toBe('CANCELLED');
      });
    });
    describe('existing bookings search', () => {
      it('should be search bookings by purchase date', async () => {
        const payload = {
          purchaseDateStart: '06/03/2020',
          purchaseDateEnd: '07/03/2020',
          dateFormat: 'DD/MM/YYYY',
          context: 'HOTELTEST',
          access: defaultAccessCode,
          language: 'es',
        };
        const retVal = await app.searchBooking({
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
          context: 'HOTELTEST',
          access: defaultAccessCode,
          language: 'es',
        };
        const retVal = await app.searchBooking({
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
        const retVal = await app.searchBooking({
          payload: {
            bookingId: '988671',
            hotelCode: '1', // required for booking search
            currency: 'USD', // required for booking search
            context: 'HOTELTEST',
            access: defaultAccessCode,
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
});
