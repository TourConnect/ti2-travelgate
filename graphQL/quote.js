// optionRefId: "01@01[201228[201229[1[3[1[ES[ES[es[EUR[0[0[1[3[0[0[26021224[TEST#TEST[232.5#0#false#EUR##0#[1|30#30|1|2020-12-28|1|1482013|1482015|3|1|0[1@1[30#30[[[mercado@ES@ExpireDate@29/12/2020"

module.exports = () => `
query ($criteria: HotelCriteriaQuoteInput!, $settings: HotelSettingsInput) {
  hotelX {
    quote(
      criteria: $criteria,
        settings: $settings
      ) {
      auditData {
        transactions {
          request
          response
        }
      }
      optionQuote {
        addOns {
          distribution {
            value
            key
          }
        }
        searchPrice {
          currency
          net
          gross
          binding
        }
        optionRefId
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
            rules {
              id
              name
              type
              value
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
        cardTypes
        remarks
        surcharges {
          chargeType
          chargeType
          price {
            currency
            binding
            net
            gross
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
