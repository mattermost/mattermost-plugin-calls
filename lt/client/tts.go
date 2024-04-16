package client

import (
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/polly"
	mp3 "github.com/hajimehoshi/go-mp3"
)

func (u *User) pollyToSpeech(text string) (io.Reader, int, error) {
	input := &polly.SynthesizeSpeechInput{
		Engine:       aws.String("neural"),
		LanguageCode: aws.String(polly.LanguageCodeEnUs),
		OutputFormat: aws.String("mp3"),
		SampleRate:   aws.String("24000"),
		VoiceId:      u.pollyVoiceID,
		Text:         aws.String(text),
	}
	output, err := u.pollySession.SynthesizeSpeech(input)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to synthesize speech with polly, err: %v", err)
	}

	dec, err := mp3.NewDecoder(output.AudioStream)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create decoder: %w", err)
	}

	return dec, dec.SampleRate(), nil
}
