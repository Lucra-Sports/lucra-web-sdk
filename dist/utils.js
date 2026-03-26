export function addDefinedSearchParams(params) {
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (key && value) {
            urlParams.set(key, value);
        }
    }
    return urlParams;
}
export function validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) {
        return undefined;
    }
    const phoneNumberRegex = /^[0-9]{10}$/;
    if (!phoneNumberRegex.test(phoneNumber)) {
        console.error("Phone number not valid, must be exactly 10 digits", phoneNumber);
        return undefined;
    }
    return phoneNumber;
}
export function validateMetadata(metadata) {
    if (metadata === null || metadata === undefined) {
        return true;
    }
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
        console.error("Metadata must be an object with string keys and string values, or null", metadata);
        return false;
    }
    for (const [key, value] of Object.entries(metadata)) {
        if (typeof key !== "string") {
            console.error(`Metadata key must be a string, received ${typeof key}:`, key);
            return false;
        }
        if (typeof value !== "string") {
            console.error(`Metadata value for key "${key}" must be a string, received ${typeof value}:`, value);
            return false;
        }
    }
    return true;
}
export function NoOp(data) {
    console.log("Not implemented", data);
    return undefined;
}
