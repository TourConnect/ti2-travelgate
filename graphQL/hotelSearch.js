module.exports = () => `
query ($criteria: HotelXHotelListInput!, $relay: RelayInput!) {
  hotelX {
    hotels (
        criteria: $criteria,
        relay: $relay
    ){
        edges {
            node {
                code
                hotelData {
                    code
                    hotelCode
                    hotelCodeSupplier
                    hotelName
                }
            }
        }
    }
  }
}
`;
