module.exports = () => `
mutation ($input: HotelCancelInput!, $settings:HotelSettingsInput) {
  hotelX {
    cancel(
      input: $input
      settings: $settings
    ) {
      auditData {
        transactions {
          request
          response
        }
      }
      errors {
        type
        code
        description
      }
      warnings {
        code
        description
      }
      cancellation {
        reference {
          client
          supplier
          hotel
          bookingID
        }
        cancelReference
        status
        price {
          currency
          binding
          net
          gross
          exchange {
            currency
            rate
          }
        }
        booking {
          paymentCard {
            code
            paymentCardData {
              type
            }
          }
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
          billingSupplierCode
          price {
            currency
            binding
            net
            gross
            exchange {
              currency
              rate
            }
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
              }
            }
          }
        }
      }
    }
  }
}

`;
