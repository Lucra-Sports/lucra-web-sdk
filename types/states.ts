export type StateFull =
  | "Alaska"
  | "Alabama"
  | "Arkansas"
  | "Arizona"
  | "California"
  | "Colorado"
  | "Connecticut"
  | "District of Columbia"
  | "Delaware"
  | "Florida"
  | "Georgia"
  | "Hawaii"
  | "Iowa"
  | "Idaho"
  | "Illinois"
  | "Indiana"
  | "Kansas"
  | "Kentucky"
  | "Louisiana"
  | "Massachusetts"
  | "Maryland"
  | "Maine"
  | "Michigan"
  | "Minnesota"
  | "Missouri"
  | "Mississippi"
  | "Montana"
  | "North Carolina"
  | "North Dakota"
  | "Nebraska"
  | "New Hampshire"
  | "New Jersey"
  | "New Mexico"
  | "Nevada"
  | "New York"
  | "Ohio"
  | "Oklahoma"
  | "Oregon"
  | "Pennsylvania"
  | "Rhode Island"
  | "South Carolina"
  | "South Dakota"
  | "Tennessee"
  | "Texas"
  | "Utah"
  | "Virginia"
  | "Vermont"
  | "Washington"
  | "Wisconsin"
  | "West Virginia"
  | "Wyoming";

export type StateCode =
  | "AK"
  | "AL"
  | "AR"
  | "AZ"
  | "CA"
  | "CO"
  | "CT"
  | "DC"
  | "DE"
  | "FL"
  | "GA"
  | "HI"
  | "IA"
  | "ID"
  | "IL"
  | "IN"
  | "KS"
  | "KY"
  | "LA"
  | "MA"
  | "MD"
  | "ME"
  | "MI"
  | "MN"
  | "MO"
  | "MS"
  | "MT"
  | "NC"
  | "ND"
  | "NE"
  | "NH"
  | "NJ"
  | "NM"
  | "NV"
  | "NY"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VA"
  | "VT"
  | "WA"
  | "WI"
  | "WV"
  | "WY";

export const States: {
  state: StateFull;
  code: StateCode;
}[] = [
  { state: "Alaska", code: "AK" },
  { state: "Alabama", code: "AL" },
  { state: "Arkansas", code: "AR" },
  { state: "Arizona", code: "AZ" },
  { state: "California", code: "CA" },
  { state: "Colorado", code: "CO" },
  { state: "Connecticut", code: "CT" },
  { state: "District of Columbia", code: "DC" },
  { state: "Delaware", code: "DE" },
  { state: "Florida", code: "FL" },
  { state: "Georgia", code: "GA" },
  { state: "Hawaii", code: "HI" },
  { state: "Iowa", code: "IA" },
  { state: "Idaho", code: "ID" },
  { state: "Illinois", code: "IL" },
  { state: "Indiana", code: "IN" },
  { state: "Kansas", code: "KS" },
  { state: "Kentucky", code: "KY" },
  { state: "Louisiana", code: "LA" },
  { state: "Massachusetts", code: "MA" },
  { state: "Maryland", code: "MD" },
  { state: "Maine", code: "ME" },
  { state: "Michigan", code: "MI" },
  { state: "Minnesota", code: "MN" },
  { state: "Missouri", code: "MO" },
  { state: "Mississippi", code: "MS" },
  { state: "Montana", code: "MT" },
  { state: "North Carolina", code: "NC" },
  { state: "North Dakota", code: "ND" },
  { state: "Nebraska", code: "NE" },
  { state: "New Hampshire", code: "NH" },
  { state: "New Jersey", code: "NJ" },
  { state: "New Mexico", code: "NM" },
  { state: "Nevada", code: "NV" },
  { state: "New York", code: "NY" },
  { state: "Ohio", code: "OH" },
  { state: "Oklahoma", code: "OK" },
  { state: "Oregon", code: "OR" },
  { state: "Pennsylvania", code: "PA" },
  { state: "Rhode Island", code: "RI" },
  { state: "South Carolina", code: "SC" },
  { state: "South Dakota", code: "SD" },
  { state: "Tennessee", code: "TN" },
  { state: "Texas", code: "TX" },
  { state: "Utah", code: "UT" },
  { state: "Virginia", code: "VA" },
  { state: "Vermont", code: "VT" },
  { state: "Washington", code: "WA" },
  { state: "Wisconsin", code: "WI" },
  { state: "West Virginia", code: "WV" },
  { state: "Wyoming", code: "WY" },
] as const;
