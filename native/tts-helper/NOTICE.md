# Third-party notices

The App TTS helper uses FluidAudio 0.15.5 and the Kokoro 82M Core ML
model. FluidAudio and the model weights are distributed under the Apache
License 2.0. A copy of that license is available in this repository's root
`LICENSE` file.

- FluidAudio: https://github.com/FluidInference/FluidAudio
- Kokoro Core ML weights: https://huggingface.co/FluidInference/kokoro-82m-coreml
- Original Kokoro model: https://huggingface.co/hexgrad/Kokoro-82M

Additional voice tensors are downloaded on demand from the original Kokoro
model at revision `f3ff3571791e39611d31c381e3a41a3af07b4987`, extracted from
its PyTorch archive container without loading or bundling PyTorch, and verified
against pinned SHA-256 digests before use.

The package lock pins FluidAudio release 0.15.5 at revision
`19600a485baa4998812e4654b70d2bab8f2c9949`.
