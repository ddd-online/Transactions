package models

import "net/http"

type AppError struct {
	Status int
	Msg    string
}

func (e *AppError) Error() string {
	return e.Msg
}

func NewBadRequest(msg string) *AppError {
	return &AppError{Status: http.StatusBadRequest, Msg: msg}
}

func NewNotFound(msg string) *AppError {
	return &AppError{Status: http.StatusNotFound, Msg: msg}
}

func NewConflict(msg string) *AppError {
	return &AppError{Status: http.StatusConflict, Msg: msg}
}

func NewInternal(msg string) *AppError {
	return &AppError{Status: http.StatusInternalServerError, Msg: msg}
}

func AsAppError(err error) *AppError {
	if ae, ok := err.(*AppError); ok {
		return ae
	}
	return NewInternal(err.Error())
}
