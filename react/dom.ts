// Gives the React tests a DOM. Imported first by react.test.tsx only, so
// react-dom loads with it. The test file unregisters it when it is done, and
// the other suites run with no DOM.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
