use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};

#[test]
fn configured_updater_key_accepts_the_fixture_and_rejects_tampering() {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .expect("Tauri configuration must be valid JSON");
    let encoded_key = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .expect("updater public key must be configured");
    let decoded_key = STANDARD
        .decode(encoded_key)
        .expect("updater public key must use base64");
    let public_key = PublicKey::decode(
        std::str::from_utf8(&decoded_key).expect("decoded updater public key must be UTF-8"),
    )
    .expect("updater public key must be a valid minisign key");
    let manifest: serde_json::Value =
        serde_json::from_str(include_str!("../../fixtures/updater/latest.json"))
            .expect("controlled updater manifest must be valid JSON");
    let manifest_signature = manifest["platforms"]["windows-x86_64"]["signature"]
        .as_str()
        .expect("controlled updater manifest must include a Windows signature");
    assert_eq!(
        manifest_signature,
        include_str!("../../fixtures/updater/signed-payload.txt.sig").trim(),
        "the controlled manifest and detached signature must remain coherent"
    );
    let decoded_signature = STANDARD
        .decode(manifest_signature)
        .expect("updater signature must use Tauri's base64 envelope");
    let signature = Signature::decode(
        std::str::from_utf8(&decoded_signature).expect("decoded updater signature must be UTF-8"),
    )
    .expect("controlled updater fixture signature must be valid minisign data");
    let payload = include_bytes!("../../fixtures/updater/signed-payload.txt");

    public_key
        .verify(payload, &signature, false)
        .expect("configured updater key must accept the signed fixture");
    let mut tampered = payload.to_vec();
    tampered.push(b'!');
    assert!(public_key.verify(&tampered, &signature, false).is_err());
}
