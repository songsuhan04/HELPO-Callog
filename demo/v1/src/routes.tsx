import { Route, Routes } from "react-router-dom";
import { GuardianRoute } from "./guards/GuardianRoute";
import { ElderRoute } from "./guards/ElderRoute";

import GStart from "./screens/gStart";
import Signup from "./screens/signup";
import Forgot from "./screens/forgot";
import Reset from "./screens/reset";
import Terms from "./screens/terms";
import Guide from "./screens/guide";
import Reg from "./screens/reg";
import Cond from "./screens/cond";
import Invite from "./screens/invite";
import GList from "./screens/gList";
import GAdmin from "./screens/gAdmin";
import GDetail from "./screens/gDetail";
import GLetter from "./screens/gLetter";
import EInvited from "./screens/eInvited";
import EHome from "./screens/eHome";
import ECheck from "./screens/eCheck";
import ESpeech from "./screens/eSpeech";
import EDone from "./screens/eDone";
import ERecord from "./screens/eRecord";
import ELetters from "./screens/eLetters";
import AuthCallback from "./screens/authCallback";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<GStart />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/e/:token" element={<EInvited />} />

      <Route path="/guardian/elders/new" element={<GuardianRoute><Reg /></GuardianRoute>} />
      <Route path="/guardian/elders/:elderId/edit" element={<GuardianRoute><Reg /></GuardianRoute>} />
      <Route path="/guardian/elders/:elderId/conditions" element={<GuardianRoute><Cond /></GuardianRoute>} />
      <Route path="/guardian/elders/:elderId/invite" element={<GuardianRoute><Invite /></GuardianRoute>} />
      <Route path="/guardian" element={<GuardianRoute><GList /></GuardianRoute>} />
      <Route path="/admin" element={<GuardianRoute><GAdmin /></GuardianRoute>} />
      <Route path="/guardian/elders/:elderId" element={<GuardianRoute><GDetail /></GuardianRoute>} />
      <Route path="/guardian/elders/:elderId/letter" element={<GuardianRoute><GLetter /></GuardianRoute>} />

      <Route path="/elder/home" element={<ElderRoute><EHome /></ElderRoute>} />
      <Route path="/elder/check" element={<ElderRoute><ECheck /></ElderRoute>} />
      <Route path="/elder/speech" element={<ElderRoute><ESpeech /></ElderRoute>} />
      <Route path="/elder/done" element={<ElderRoute><EDone /></ElderRoute>} />
      <Route path="/elder/record" element={<ElderRoute><ERecord /></ElderRoute>} />
      <Route path="/elder/letters" element={<ElderRoute><ELetters /></ElderRoute>} />
    </Routes>
  );
}
