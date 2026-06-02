import { useGame } from "../store/gameStore.jsx";
import { getAcceptedOutgoingTermsOffers, getTransferTermsPreview, fmtFee, teamName } from "../engine/transferEngine.js";

export default function TransferAcceptedModal({ setScreen }) {
  const { state, dispatch } = useGame();
  if (!state) return null;
  const offers = getAcceptedOutgoingTermsOffers(state);
  const pendingId = state.transferMarket?.pendingAcceptedOfferId;
  const offer = offers.find(n => n.id === pendingId);
  const preview = getTransferTermsPreview(state, offer);
  if (!offer || !preview) return null;

  function openTerms() {
    dispatch({ type: "OPEN_TRANSFER_TERMS", negotiationId: offer.id });
    setScreen?.("transfers");
  }
  function viewCentre() {
    dispatch({ type: "DISMISS_TRANSFER_ACCEPTED_MODAL" });
    setScreen?.("transfers");
  }

  return (
    <div className="transfer-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="transfer-accepted-title">
      <div className="transfer-modal transfer-accepted-modal">
        <div className="transfer-modal-kicker">Action required</div>
        <h2 id="transfer-accepted-title">Offer Accepted</h2>
        <p>
          {teamName(offer.toTeamId)} have accepted your {fmtFee(preview.transferFee)} offer for <strong>{preview.player.name}</strong>.
          You now need to agree player terms before the transfer can be completed.
        </p>
        <div className="transfer-modal-summary">
          <span><strong>Next step</strong> Agree player terms</span>
          <span><strong>From</strong> {teamName(offer.toTeamId)}</span>
          <span><strong>Fee</strong> {fmtFee(preview.transferFee)}</span>
        </div>
        <div className="transfer-modal-actions">
          <button className="btn-primary" onClick={openTerms}>Open Contract Terms</button>
          <button className="btn-secondary" onClick={viewCentre}>View Transfer Centre</button>
          <button className="btn-secondary" onClick={() => dispatch({ type: "DISMISS_TRANSFER_ACCEPTED_MODAL" })}>Later</button>
        </div>
      </div>
    </div>
  );
}
