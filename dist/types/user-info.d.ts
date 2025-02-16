import type { StateCode } from "./states";
export type UserInfo = {
    zip: string;
    city: string;
    state: StateCode;
    dobDay: number;
    street: string;
    dobYear: number;
    dobMonth: number;
    lastName: string;
    firstName: string;
};
