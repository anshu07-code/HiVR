export { DiditApiError } from "./client";
export {
  verifyPassiveLiveness,
  type PassiveLivenessResult,
} from "./liveness";
export {
  verifyIdDocument,
  type IdVerificationResult,
} from "./id-verification";
export {
  matchFaces,
  type FaceMatchResult,
} from "./face-match";
export {
  createSession,
  getSessionDecision,
  type DiditSessionResult,
  type DiditDecision,
} from "./session";
