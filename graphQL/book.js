module.exports = () => `
mutation ($input: HotelBookInput!, $settings: HotelSettingsInput) {
  hotelX {
    book( input: $input, settings: $settings) {
       booking {
        price {
          currency
          binding
          net
          gross
          exchange {
            currency
            rate
          }
          markups {
            channel
            currency
            binding
            net
            gross
            exchange {
              currency
              rate
            }
          }
        }
        status
        remarks
        reference {
          client
          supplier
          bookingID
          hotel
        }
        holder {
          name
          surname
        }
        hotel {
          creationDate
          checkIn
          checkOut
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
            code
            description
            occupancyRefId
            price {
              currency
              binding
              net
              gross
              exchange {
                currency
                rate
              }
              markups {
                channel
                currency
                binding
                net
                gross
                exchange {
                  currency
                  rate
                }
              }
            }
          }
        }
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
