// Code generated by mockery v2.40.3. DO NOT EDIT.

package interfaces

import (
	service "github.com/mattermost/rtcd/service"
	mock "github.com/stretchr/testify/mock"
)

// MockRTCDClient is an autogenerated mock type for the RTCDClient type
type MockRTCDClient struct {
	mock.Mock
}

type MockRTCDClient_Expecter struct {
	mock *mock.Mock
}

func (_m *MockRTCDClient) EXPECT() *MockRTCDClient_Expecter {
	return &MockRTCDClient_Expecter{mock: &_m.Mock}
}

// Close provides a mock function with given fields:
func (_m *MockRTCDClient) Close() error {
	ret := _m.Called()

	if len(ret) == 0 {
		panic("no return value specified for Close")
	}

	var r0 error
	if rf, ok := ret.Get(0).(func() error); ok {
		r0 = rf()
	} else {
		r0 = ret.Error(0)
	}

	return r0
}

// MockRTCDClient_Close_Call is a *mock.Call that shadows Run/Return methods with type explicit version for method 'Close'
type MockRTCDClient_Close_Call struct {
	*mock.Call
}

// Close is a helper method to define mock.On call
func (_e *MockRTCDClient_Expecter) Close() *MockRTCDClient_Close_Call {
	return &MockRTCDClient_Close_Call{Call: _e.mock.On("Close")}
}

func (_c *MockRTCDClient_Close_Call) Run(run func()) *MockRTCDClient_Close_Call {
	_c.Call.Run(func(args mock.Arguments) {
		run()
	})
	return _c
}

func (_c *MockRTCDClient_Close_Call) Return(_a0 error) *MockRTCDClient_Close_Call {
	_c.Call.Return(_a0)
	return _c
}

func (_c *MockRTCDClient_Close_Call) RunAndReturn(run func() error) *MockRTCDClient_Close_Call {
	_c.Call.Return(run)
	return _c
}

// Connected provides a mock function with given fields:
func (_m *MockRTCDClient) Connected() bool {
	ret := _m.Called()

	if len(ret) == 0 {
		panic("no return value specified for Connected")
	}

	var r0 bool
	if rf, ok := ret.Get(0).(func() bool); ok {
		r0 = rf()
	} else {
		r0 = ret.Get(0).(bool)
	}

	return r0
}

// MockRTCDClient_Connected_Call is a *mock.Call that shadows Run/Return methods with type explicit version for method 'Connected'
type MockRTCDClient_Connected_Call struct {
	*mock.Call
}

// Connected is a helper method to define mock.On call
func (_e *MockRTCDClient_Expecter) Connected() *MockRTCDClient_Connected_Call {
	return &MockRTCDClient_Connected_Call{Call: _e.mock.On("Connected")}
}

func (_c *MockRTCDClient_Connected_Call) Run(run func()) *MockRTCDClient_Connected_Call {
	_c.Call.Run(func(args mock.Arguments) {
		run()
	})
	return _c
}

func (_c *MockRTCDClient_Connected_Call) Return(_a0 bool) *MockRTCDClient_Connected_Call {
	_c.Call.Return(_a0)
	return _c
}

func (_c *MockRTCDClient_Connected_Call) RunAndReturn(run func() bool) *MockRTCDClient_Connected_Call {
	_c.Call.Return(run)
	return _c
}

// GetSystemInfo provides a mock function with given fields:
func (_m *MockRTCDClient) GetSystemInfo() (service.SystemInfo, error) {
	ret := _m.Called()

	if len(ret) == 0 {
		panic("no return value specified for GetSystemInfo")
	}

	var r0 service.SystemInfo
	var r1 error
	if rf, ok := ret.Get(0).(func() (service.SystemInfo, error)); ok {
		return rf()
	}
	if rf, ok := ret.Get(0).(func() service.SystemInfo); ok {
		r0 = rf()
	} else {
		r0 = ret.Get(0).(service.SystemInfo)
	}

	if rf, ok := ret.Get(1).(func() error); ok {
		r1 = rf()
	} else {
		r1 = ret.Error(1)
	}

	return r0, r1
}

// MockRTCDClient_GetSystemInfo_Call is a *mock.Call that shadows Run/Return methods with type explicit version for method 'GetSystemInfo'
type MockRTCDClient_GetSystemInfo_Call struct {
	*mock.Call
}

// GetSystemInfo is a helper method to define mock.On call
func (_e *MockRTCDClient_Expecter) GetSystemInfo() *MockRTCDClient_GetSystemInfo_Call {
	return &MockRTCDClient_GetSystemInfo_Call{Call: _e.mock.On("GetSystemInfo")}
}

func (_c *MockRTCDClient_GetSystemInfo_Call) Run(run func()) *MockRTCDClient_GetSystemInfo_Call {
	_c.Call.Run(func(args mock.Arguments) {
		run()
	})
	return _c
}

func (_c *MockRTCDClient_GetSystemInfo_Call) Return(_a0 service.SystemInfo, _a1 error) *MockRTCDClient_GetSystemInfo_Call {
	_c.Call.Return(_a0, _a1)
	return _c
}

func (_c *MockRTCDClient_GetSystemInfo_Call) RunAndReturn(run func() (service.SystemInfo, error)) *MockRTCDClient_GetSystemInfo_Call {
	_c.Call.Return(run)
	return _c
}

// GetVersionInfo provides a mock function with given fields:
func (_m *MockRTCDClient) GetVersionInfo() (service.VersionInfo, error) {
	ret := _m.Called()

	if len(ret) == 0 {
		panic("no return value specified for GetVersionInfo")
	}

	var r0 service.VersionInfo
	var r1 error
	if rf, ok := ret.Get(0).(func() (service.VersionInfo, error)); ok {
		return rf()
	}
	if rf, ok := ret.Get(0).(func() service.VersionInfo); ok {
		r0 = rf()
	} else {
		r0 = ret.Get(0).(service.VersionInfo)
	}

	if rf, ok := ret.Get(1).(func() error); ok {
		r1 = rf()
	} else {
		r1 = ret.Error(1)
	}

	return r0, r1
}

// MockRTCDClient_GetVersionInfo_Call is a *mock.Call that shadows Run/Return methods with type explicit version for method 'GetVersionInfo'
type MockRTCDClient_GetVersionInfo_Call struct {
	*mock.Call
}

// GetVersionInfo is a helper method to define mock.On call
func (_e *MockRTCDClient_Expecter) GetVersionInfo() *MockRTCDClient_GetVersionInfo_Call {
	return &MockRTCDClient_GetVersionInfo_Call{Call: _e.mock.On("GetVersionInfo")}
}

func (_c *MockRTCDClient_GetVersionInfo_Call) Run(run func()) *MockRTCDClient_GetVersionInfo_Call {
	_c.Call.Run(func(args mock.Arguments) {
		run()
	})
	return _c
}

func (_c *MockRTCDClient_GetVersionInfo_Call) Return(_a0 service.VersionInfo, _a1 error) *MockRTCDClient_GetVersionInfo_Call {
	_c.Call.Return(_a0, _a1)
	return _c
}

func (_c *MockRTCDClient_GetVersionInfo_Call) RunAndReturn(run func() (service.VersionInfo, error)) *MockRTCDClient_GetVersionInfo_Call {
	_c.Call.Return(run)
	return _c
}

// Send provides a mock function with given fields: msg
func (_m *MockRTCDClient) Send(msg service.ClientMessage) error {
	ret := _m.Called(msg)

	if len(ret) == 0 {
		panic("no return value specified for Send")
	}

	var r0 error
	if rf, ok := ret.Get(0).(func(service.ClientMessage) error); ok {
		r0 = rf(msg)
	} else {
		r0 = ret.Error(0)
	}

	return r0
}

// MockRTCDClient_Send_Call is a *mock.Call that shadows Run/Return methods with type explicit version for method 'Send'
type MockRTCDClient_Send_Call struct {
	*mock.Call
}

// Send is a helper method to define mock.On call
//   - msg service.ClientMessage
func (_e *MockRTCDClient_Expecter) Send(msg interface{}) *MockRTCDClient_Send_Call {
	return &MockRTCDClient_Send_Call{Call: _e.mock.On("Send", msg)}
}

func (_c *MockRTCDClient_Send_Call) Run(run func(msg service.ClientMessage)) *MockRTCDClient_Send_Call {
	_c.Call.Run(func(args mock.Arguments) {
		run(args[0].(service.ClientMessage))
	})
	return _c
}

func (_c *MockRTCDClient_Send_Call) Return(_a0 error) *MockRTCDClient_Send_Call {
	_c.Call.Return(_a0)
	return _c
}

func (_c *MockRTCDClient_Send_Call) RunAndReturn(run func(service.ClientMessage) error) *MockRTCDClient_Send_Call {
	_c.Call.Return(run)
	return _c
}

// NewMockRTCDClient creates a new instance of MockRTCDClient. It also registers a testing interface on the mock and a cleanup function to assert the mocks expectations.
// The first argument is typically a *testing.T value.
func NewMockRTCDClient(t interface {
	mock.TestingT
	Cleanup(func())
}) *MockRTCDClient {
	mock := &MockRTCDClient{}
	mock.Mock.Test(t)

	t.Cleanup(func() { mock.AssertExpectations(t) })

	return mock
}
