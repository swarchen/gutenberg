/**
 * External dependencies
 */
import isShallowEqual from 'shallowequal';
import { combineReducers, createStore } from 'redux';
import { flowRight, without, mapValues, isFunction, omitBy, forEach } from 'lodash';

/**
 * WordPress dependencies
 */
import { deprecated } from '@wordpress/utils';
import { Component, getWrapperDisplayName } from '@wordpress/element';

/**
 * Internal dependencies
 */
export { loadAndPersist, withRehydratation } from './persist';

/**
 * Module constants
 */
const stores = {};
const selectors = {};
const actions = {};
let listeners = [];

/**
 * Global listener called for each store's update.
 */
export function globalListener() {
	listeners.forEach( ( listener ) => listener() );
}

/**
 * Convenience for registering reducer with actions and selectors.
 *
 * @param {string} reducerKey Reducer key.
 * @param {Object} options    Store description (reducer, actions, selectors).
 *
 * @return {Object} Registered store object.
 */
export function registerStore( reducerKey, options ) {
	if ( ! options.reducer ) {
		throw new TypeError( 'Must specify store reducer' );
	}

	const store = registerReducer( reducerKey, options.reducer );

	if ( options.actions ) {
		registerActions( reducerKey, options.actions );
	}

	if ( options.selectors ) {
		registerSelectors( reducerKey, options.selectors );
	}

	return store;
}

/**
 * Registers a new sub-reducer to the global state and returns a Redux-like store object.
 *
 * @param {string} reducerKey Reducer key.
 * @param {Object} reducer    Reducer function.
 *
 * @return {Object} Store Object.
 */
export function registerReducer( reducerKey, reducer ) {
	const enhancers = [];
	if ( window.__REDUX_DEVTOOLS_EXTENSION__ ) {
		enhancers.push( window.__REDUX_DEVTOOLS_EXTENSION__( { name: reducerKey, instanceId: reducerKey } ) );
	}
	const store = createStore( reducer, flowRight( enhancers ) );
	stores[ reducerKey ] = store;

	// Customize subscribe behavior to call listeners only on effective change,
	// not on every dispatch.
	let lastState = store.getState();
	store.subscribe( () => {
		const state = store.getState();
		const hasChanged = state !== lastState;
		lastState = state;

		if ( hasChanged ) {
			globalListener();
		}
	} );

	return store;
}

/**
 * The combineReducers helper function turns an object whose values are different
 * reducing functions into a single reducing function you can pass to registerReducer.
 *
 * @param {Object} reducers An object whose values correspond to different reducing
 *                          functions that need to be combined into one.
 *
 * @return {Function}       A reducer that invokes every reducer inside the reducers
 *                          object, and constructs a state object with the same shape.
 */
export { combineReducers };

/**
 * Registers selectors for external usage.
 *
 * @param {string} reducerKey   Part of the state shape to register the
 *                              selectors for.
 * @param {Object} newSelectors Selectors to register. Keys will be used as the
 *                              public facing API. Selectors will get passed the
 *                              state as first argument.
 */
export function registerSelectors( reducerKey, newSelectors ) {
	const store = stores[ reducerKey ];
	const createStateSelector = ( selector ) => ( ...args ) => selector( store.getState(), ...args );
	selectors[ reducerKey ] = mapValues( newSelectors, ( selector ) => {
		return {
			...( isFunction( selector ) ? {} : selector ),
			select: createStateSelector( isFunction( selector ) ? selector : selector.select ),
		};
	} );
}

/**
 * Registers actions for external usage.
 *
 * @param {string} reducerKey   Part of the state shape to register the
 *                              selectors for.
 * @param {Object} newActions   Actions to register.
 */
export function registerActions( reducerKey, newActions ) {
	const store = stores[ reducerKey ];
	const createBoundAction = ( action ) => ( ...args ) => store.dispatch( action( ...args ) );
	actions[ reducerKey ] = mapValues( newActions, createBoundAction );
}

/**
 * Subscribe to changes to any data.
 *
 * @param {Function}   listener Listener function.
 *
 * @return {Function}           Unsubscribe function.
 */
export const subscribe = ( listener ) => {
	listeners.push( listener );

	return () => {
		listeners = without( listeners, listener );
	};
};

/**
 * Calls a selector given the current state and extra arguments.
 *
 * @param {string} reducerKey Part of the state shape to register the
 *                            selectors for.
 *
 * @return {*} The selector's returned value.
 */
export function select( reducerKey ) {
	return mapValues( selectors[ reducerKey ], ( selector ) => selector.select );
}

/**
 * Returns the available actions for a part of the state.
 *
 * @param {string} reducerKey Part of the state shape to dispatch the
 *                            action for.
 *
 * @return {*} The action's returned value.
 */
export function dispatch( reducerKey ) {
	return actions[ reducerKey ];
}

/**
 * Higher-order component used to inject state-derived props using registered
 * selectors.
 *
 * @param {Function} mapStateToProps Function called on every state change,
 *                                   expected to return object of props to
 *                                   merge with the component's own props.
 *
 * @return {Component} Enhanced component with merged state data props.
 */
export const withSelect = ( mapStateToProps ) => ( WrappedComponent ) => {
	class ComponentWithSelect extends Component {
		constructor() {
			super( ...arguments );

			this.runSelection = this.runSelection.bind( this );

			this.state = {};
		}

		componentWillMount() {
			this.subscribe();

			// Populate initial state.
			this.runSelection();
		}

		componentWillReceiveProps( nextProps ) {
			if ( ! isShallowEqual( nextProps, this.props ) ) {
				this.runSelection( nextProps );
			}
		}

		componentWillUnmount() {
			this.unsubscribe();

			// While above unsubscribe avoids future listener calls, callbacks
			// are snapshotted before being invoked, so if unmounting occurs
			// during a previous callback, we need to explicitly track and
			// avoid the `runSelection` that is scheduled to occur.
			this.isUnmounting = true;
		}

		subscribe() {
			this.unsubscribe = subscribe( this.runSelection );
		}

		runSelection( props = this.props ) {
			if ( this.isUnmounting ) {
				return;
			}

			const { mergeProps } = this.state;
			const nextMergeProps = mapStateToProps( select, props ) || {};

			if ( ! isShallowEqual( nextMergeProps, mergeProps ) ) {
				this.setState( {
					mergeProps: nextMergeProps,
				} );
			}
		}

		render() {
			return <WrappedComponent { ...this.props } { ...this.state.mergeProps } />;
		}
	}

	ComponentWithSelect.displayName = getWrapperDisplayName( WrappedComponent, 'select' );

	return ComponentWithSelect;
};

/**
 * Higher-order component used to add dispatch props using registered action
 * creators.
 *
 * @param {Object} mapDispatchToProps Object of prop names where value is a
 *                                    dispatch-bound action creator, or a
 *                                    function to be called with with the
 *                                    component's props and returning an
 *                                    action creator.
 *
 * @return {Component} Enhanced component with merged dispatcher props.
 */
export const withDispatch = ( mapDispatchToProps ) => ( WrappedComponent ) => {
	class ComponentWithDispatch extends Component {
		constructor() {
			super( ...arguments );

			this.proxyProps = {};
		}

		componentWillMount() {
			this.setProxyProps( this.props );
		}

		componentWillUpdate( nextProps ) {
			this.setProxyProps( nextProps );
		}

		proxyDispatch( propName, ...args ) {
			// Original dispatcher is a pre-bound (dispatching) action creator.
			mapDispatchToProps( dispatch, this.props )[ propName ]( ...args );
		}

		setProxyProps( props ) {
			// Assign as instance property so that in reconciling subsequent
			// renders, the assigned prop values are referentially equal.
			const propsToDispatchers = mapDispatchToProps( dispatch, props );
			this.proxyProps = mapValues( propsToDispatchers, ( dispatcher, propName ) => {
				// Prebind with prop name so we have reference to the original
				// dispatcher to invoke. Track between re-renders to avoid
				// creating new function references every render.
				if ( this.proxyProps.hasOwnProperty( propName ) ) {
					return this.proxyProps[ propName ];
				}

				return this.proxyDispatch.bind( this, propName );
			} );
		}

		render() {
			return <WrappedComponent { ...this.props } { ...this.proxyProps } />;
		}
	}

	ComponentWithDispatch.displayName = getWrapperDisplayName( WrappedComponent, 'dispatch' );

	return ComponentWithDispatch;
};

/**
 * Higher-order component used to inject state-derived props using registered
 * selectors and trigger the necessary actions to fetch the selected data.
 *
 * @param {Function} mapStateToProps Function called on every state change,
 *                                   expected to return object of resolvers to
 *                                   run and provide prop for resolver.
 *
 * @return {Component} Enhanced component with merged state data props.
 */
export const withData = ( mapStateToProps ) => ( WrappedComponent ) => {
	class ComponentWithData extends Component {
		constructor() {
			super( ...arguments );

			this.runSelection = this.runSelection.bind( this );

			this.state = {};
			this.resolvers = {};
		}

		componentWillMount() {
			this.subscribe();

			// Populate initial state.
			this.runResolvers();
		}

		componentWillReceiveProps( nextProps ) {
			if ( ! isShallowEqual( nextProps, this.props ) ) {
				this.runResolvers( nextProps );
			}
		}

		componentWillUnmount() {
			this.unsubscribe();
		}

		subscribe() {
			this.unsubscribe = subscribe( this.runSelection );
		}

		resolve( props ) {
			const resolve = ( reducerKey ) => {
				return mapValues( selectors[ reducerKey ], ( selector, key ) => {
					return ( ...args ) => ( {
						args,
						key,
						reducerKey,
					} );
				} );
			};
			return mapStateToProps( resolve, props );
		}

		runResolvers( props = this.props ) {
			const resolvers = this.resolve( props );
			const newResolvers = omitBy( resolvers, ( resolver, key ) => {
				const previousResolver = this.resolvers[ key ];
				return (
					!! previousResolver &&
					previousResolver.key === resolver.key &&
					isShallowEqual( previousResolver.args, resolver.args )
				);
			} );
			this.resolvers = resolvers;
			this.runSideEffects( newResolvers );
			this.runSelection();
		}

		runSideEffects( resolvers ) {
			forEach( resolvers, ( { key, reducerKey, args } ) => {
				const selector = selectors[ reducerKey ][ key ];
				if ( selector.effect ) {
					selector.effect( ...args );
				}
			} );
		}

		runSelection() {
			const newState = mapValues( this.resolvers, ( { key, reducerKey, args } ) => {
				const selector = selectors[ reducerKey ][ key ];
				return selector.select( ...args );
			} );
			if ( ! isShallowEqual( newState, this.state ) ) {
				this.setState( newState );
			}
		}

		render() {
			return <WrappedComponent { ...this.props } { ...this.state } />;
		}
	}

	ComponentWithData.displayName = getWrapperDisplayName( WrappedComponent, 'data' );

	return ComponentWithData;
};

export const query = ( mapSelectToProps ) => {
	deprecated( 'wp.data.query', {
		version: '2.5',
		alternative: 'wp.data.withSelect',
		plugin: 'Gutenberg',
	} );

	return withSelect( mapSelectToProps );
};
