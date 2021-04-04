module.exports = () => `
query ($criteria: HotelCriteriaBookingInput!, $settings: HotelSettingsInput) {
  hotelX {
    booking(
      criteria: $criteria,
      settings: $settings,
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
          bookingDate
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
