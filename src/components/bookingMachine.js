import {
  assign,
  createMachine,
  interpret,
  send,
  spawn,
  sendParent,
} from "xstate";

import fetchMachine from "./fetchMachine.js";
import loginMachine from "./loginMachine.js";
//import getGroupDetails from "./getGroupDetails.js";

const getGroupDetails = (context, event) =>
  new Promise((resolve, reject) => {
    var groupDetails = {};

    for (const group in context.groups) {
      console.log("getting group details for", group);
      fetch(import.meta.env.VITE_APP_BOOK_SERVER + "/api/v1/groups/" + group, {
        method: "GET",
        headers: {
          Authorization: context.token,
        },
      })
        .then((res) => res.json())
        .then((details) => {
          groupDetails[group] = details;
        });
    }
    console.log("finished getting groups", groupDetails);
    // TODO handle error here
    return resolve({ status: "ok", groupDetails: groupDetails });
  });

const bookingMachine = createMachine({
  id: "bookingMachine",
  initial: "login",
  context: {
    bookings: "",
    userName: "",
    token: "",
    groups: {}, //groups we can choose from (includes description)
    group: null, //name of currently selected group
    groupDetails: {}, //subMachines see https://xstate.js.org/docs/tutorials/reddit.html#spawning-subreddit-actors
  },
  states: {
    login: {
      invoke: {
        src: loginMachine,
        data: {
          defaultGroup: "g-everyone",
          secondGroup: "g-engdes1-lab", //TODO get from query rather than hardcoding
        },
        onDone: {
          target: "bookings",
          actions: assign({
            groups: (context, event) => {
              return event.data.groups;
            },
            token: (context, event) => {
              return event.data.token;
            },
            userName: (context, event) => {
              return event.data.userName;
            },
          }),
        },
        onError: {
          target: "terminated",
        },
      },
    },
    bookings: {
      invoke: {
        src: fetchMachine,
        data: {
          path: (context, event) =>
            import.meta.env.VITE_APP_BOOK_SERVER +
            "/api/v1/users/" +
            context.userName +
            "/bookings",
          method: "GET",
          token: (context, event) => context.token,
        },
        onDone: {
          target: "groups",
          actions: assign({
            bookings: (context, event) => {
              return event.data;
            },
          }),
        },
        onError: {
          target: "terminated",
        },
      },
    },
    groups: {
      invoke: {
        src: getGroupDetails,
        onDone: {
          target: "idle",
          actions: assign({
            groupDetails: (context, event) => {
              return event.data.groupDetails;
            },
          }),
        },
        onError: {
          target: "idle", //TODO figure out what to do here if error
        },
      },
    },
    idle: {
      on: {
        SELECT: {
          target: "selected",
          actions: assign({
            group: (context, event) => {
              //put event name in the group field
              return event.name;
            },
          }),
        },
      },
    },
    selected: {
      invoke: {
        src: fetchMachine,
        data: {
          path: (context, event) =>
            import.meta.env.VITE_APP_BOOK_SERVER +
            "/api/v1/groups/" +
            context.group,
          method: "GET",
          token: (context, event) => context.token,
        },
        onDone: {
          target: "displayGroup",
          actions: assign({
            groupDetails: (context, event) => {
              return event.data;
            },
          }),
        },
        onError: {
          target: "terminated",
        },
      },
    },
    displayGroup: {},

    terminated: {
      type: "final",
    },
  },
});

export default {
  name: "Booking",
  created() {
    // Start service on component creation
    this.BookingService.onTransition((state) => {
      // Update the current state component data property with the next state
      this.current = state;
      // Update the context component data property with the updated context
      this.context = state.context;
    }).start();
  },
  data() {
    return {
      // Interpret the machine and store it in data
      BookingService: interpret(bookingMachine, {
        devTools: true,
      }).onTransition((state) => console.log(state.value)),

      // Start with the machine's initial state
      current: bookingMachine.initialState,

      // Start with the machine's initial context
      context: bookingMachine.context,
      //try to store the results somewhere where component can get them?
      results: {},
    };
  },
  methods: {
    // Send events to the service
    send(event) {
      this.BookingService.send(event);
    },
  },
};
